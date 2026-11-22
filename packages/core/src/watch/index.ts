// `lanes watch --lane <l>`: a script, not a model. Polls gh with since= + ETag, exits only on something actionable.
import type { WatchResult } from "../contracts/WatchResult.ts";
import { loadConfig } from "../config/index.ts";
import { cachePath, findRoot, readJson, writeJson } from "../util/fs.ts";
import { cliCommand, readBinding } from "../util/local.ts";
import { BOT, api, autopilotOn, labelNames, list, parseMeta, refreshIssuesCache, repoSlug } from "../github/index.ts";

interface Seen { sig: string; comments: number; title: string }
interface Inbox {
  v: 1; lane: string; etag?: string; since?: string;
  issues: Record<string, Seen>;
  items: { issue: number; type: string; contract?: string; title?: string; reason?: string; at: number }[];
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function watch(cwd: string, o: { lane?: string; once?: boolean; maxMinutes?: number; interval?: number }): Promise<number> {
  const root = findRoot(cwd);
  const cfg = root && loadConfig(root).cfg;
  if (!root || !cfg) { process.stderr.write("lanes watch: no valid lanes.yaml\n"); return 2; }
  const lane = o.lane ?? readBinding(root)?.lane;
  if (!lane || !cfg.lanes[lane]) { process.stderr.write(`lanes watch: pass --lane <${Object.keys(cfg.lanes).join("|")}>\n`); return 2; }
  const repo = repoSlug(root);
  const file = cachePath(root, "inbox.json");
  const next = `${cliCommand(root)} watch --lane ${lane}`;
  const interval = Math.max(o.interval ?? cfg.settings.watch_interval_sec, process.env.LANES_FAST_WATCH ? 0 : 10) * 1000;
  const deadline = Date.now() + (o.maxMinutes ?? 55) * 60_000;
  for (;;) {
    const inbox: Inbox = readJson<Inbox>(file)?.lane === lane ? readJson<Inbox>(file)! : { v: 1, lane, issues: {}, items: [] };
    const items = poll(repo, lane, inbox);
    inbox.items = inbox.items.slice(-50);
    writeJson(file, inbox);
    if (items.length) {
      refreshIssuesCache(root, repo);
      const auto = autopilotOn(repo, cfg);
      // only blockers labeled auto-fix are for the autonomous fixer (a failed PR of yours is fixed on its own branch)
      const res: WatchResult = { v: 1, lane, items: items.map(({ autoFix, ...i }) => ({ ...i, autopilot: auto && i.type === "blocker" && autoFix })), next };
      process.stdout.write(JSON.stringify(res) + "\n");
      return 0;
    }
    if (o.once) return 0;
    if (Date.now() > deadline) { process.stdout.write(JSON.stringify({ v: 1, lane, items: [], next } satisfies WatchResult) + "\n"); return 0; }
    await sleep(interval);
  }
}

type Item = Omit<WatchResult["items"][number], "autopilot"> & { autoFix: boolean };

function poll(repo: string, lane: string, inbox: Inbox): Item[] {
  const q = `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(`lane:${lane}`)}&sort=updated&direction=asc&per_page=100${inbox.since ? `&since=${inbox.since}` : ""}`;
  let r: ReturnType<typeof api>;
  try { r = api("GET", q, undefined, inbox.etag ? { "If-None-Match": inbox.etag } : {}); } catch (e) {
    if (/\b304\b/.test((e as Error).message)) return []; // some gh versions surface 304 as an error
    throw e;
  }
  if (r.status === 304 || !Array.isArray(r.data)) return [];
  if (r.headers.etag) inbox.etag = r.headers.etag;
  const out: Item[] = [];
  for (const i of r.data) {
    if (i.pull_request) continue;
    const labels = labelNames(i);
    const meta = parseMeta(i.body);
    const type = (["blocker", "request", "notice"] as const).find((t) => labels.includes(`lanes:${t}`)) ?? meta?.type;
    if (!type || (type !== "blocker" && type !== "request" && type !== "notice")) continue;
    // signature = what matters to a fixer: claimable or not, labels, meta minus claim bookkeeping
    const { lease: _l, attempts: _a, ...rest } = meta ?? ({} as any);
    const leased = !!meta?.lease && meta.lease.until > Date.now();
    const sig = JSON.stringify([rest, labels.filter((l) => l !== "claimed").sort(), leased]);
    const prev = inbox.issues[i.number];
    const at = Date.parse(i.updated_at) || Date.now();
    const base = { issue: i.number, type, ...(meta?.contract ? { contract: meta.contract } : {}) };
    let reason: Item["reason"] | undefined;
    if (!prev) reason = "new";
    else if (prev.sig !== sig) reason = "updated";
    if (prev && i.comments > prev.comments) {
      const comments = list(`/repos/${repo}/issues/${i.number}/comments`).slice(prev.comments);
      if (comments.some((c: any) => !String(c.body ?? "").includes(BOT))) reason = "human-comment";
    }
    inbox.issues[i.number] = { sig, comments: i.comments, title: i.title };
    if (!inbox.since || i.updated_at > inbox.since) inbox.since = i.updated_at;
    if (!reason) continue;
    inbox.items.push({ ...base, title: i.title, reason, at });
    if (type !== "notice" && !leased) out.push({ ...base, type, reason, autoFix: labels.includes("auto-fix") });
  }
  return out;
}
