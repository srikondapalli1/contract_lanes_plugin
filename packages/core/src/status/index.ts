import type { CheckReport } from "../contracts/CheckReport.ts";
import { loadConfig } from "../config/index.ts";
import { cachePath, findRoot, readJson } from "../util/fs.ts";
import { api, labelNames, list, parseMeta, refreshIssuesCache, repoSlug } from "../github/index.ts";
import { linkedIssues } from "../queue/index.ts";

const DAY = 86_400_000;
const pct = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : "n/a (no merged PRs)");
const dur = (ms: number) => (ms < 3_600_000 ? `${Math.round(ms / 60_000)}m` : ms < DAY ? `${(ms / 3_600_000).toFixed(1)}h` : `${(ms / DAY).toFixed(1)}d`);

export function threeNumbers(merged: any[], issueCreated: (n: number) => { created: number; blocker: boolean } | undefined, now = Date.now()) {
  const recent = merged.filter((p) => p.merged_at && now - Date.parse(p.merged_at) <= 7 * DAY);
  const auto = recent.filter((p) => labelNames(p).includes("auto-fix")).length;
  const reverted = recent.filter((p) => merged.some((r) => r.merged_at && (r.title === `Revert "${p.title}"` || new RegExp(`Reverts .*#${p.number}\\b`).test(r.body ?? "")) && Date.parse(r.merged_at) - Date.parse(p.merged_at) <= 7 * DAY)).length;
  const times: number[] = [];
  for (const p of recent) for (const i of linkedIssues(p.body)) { const c = issueCreated(i); if (c?.blocker) times.push(Date.parse(p.merged_at) - c.created); }
  times.sort((a, b) => a - b);
  const median = times.length ? (times.length % 2 ? times[(times.length - 1) / 2] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2) : undefined;
  return { merged: recent.length, auto, reverted, median };
}

export async function status(cwd: string, o: { json?: boolean }): Promise<string> {
  const root = findRoot(cwd);
  if (!root) return "no lanes.yaml here; run lanes init";
  const cfg = loadConfig(root).cfg;
  const report = readJson<CheckReport>(cachePath(root, "report.json"));
  const out: string[] = [];
  if (!report) out.push("Edges: no check report yet (run lanes check)");
  else {
    const s = report.summary;
    out.push(`Edges (check ${dur(Date.now() - report.startedAt)} ago, ${report.mode}): ✅ ${s.pass} pass · ❌ ${s.fail} fail · ⏳ ${s.pending} pending · ○ ${s.untested} untested`);
    for (const e of report.edges.filter((x) => x.status !== "pass")) out.push(`  ${e.status.padEnd(8)} ${e.contract} ${e.producer} → ${e.consumer}${e.failures[0] ? `: ${e.failures[0].message.slice(0, 120)} (owner ${e.failures[0].owner})` : ""}`);
  }
  let gh: any = {};
  try {
    const repo = repoSlug(root);
    const cache = refreshIssuesCache(root, repo);
    const needs = cache.issues.filter((i) => i.labels.includes("needs-owner"));
    const claimed = cache.issues.filter((i) => i.labels.includes("claimed"));
    out.push(`Needs owner (${needs.length}):`, ...needs.map((i) => `  #${i.number} → ${i.meta?.to ?? "?"} ${cfg?.lanes[i.meta?.to ?? ""]?.owner ?? ""}: ${i.title}`));
    out.push(`Fixes in flight (${claimed.length}):`, ...claimed.map((i) => `  #${i.number} ${i.meta?.lease ? `claimed by ${i.meta.lease.by} until ${new Date(i.meta.lease.until).toISOString().slice(11, 16)}Z` : "claimed"} (attempt ${i.meta?.attempts ?? 1}/${cfg?.settings.fix_attempts ?? 2})`));
    const merged = list(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc`).filter((p: any) => p.merged_at);
    const memo = new Map<number, any>();
    const nums = threeNumbers(merged, (n) => {
      if (!memo.has(n)) { try { const i = api("GET", `/repos/${repo}/issues/${n}`).data; memo.set(n, { created: Date.parse(i.created_at), blocker: labelNames(i).includes("lanes:blocker") || parseMeta(i.body)?.type === "blocker" }); } catch { memo.set(n, undefined); } }
      return memo.get(n);
    });
    gh = { needsOwner: needs.map((i) => i.number), claimed: claimed.map((i) => i.number), ...nums };
    out.push(`Last 7 days: auto-merge share ${pct(nums.auto, nums.merged)} · revert rate ${pct(nums.reverted, nums.merged)} · median blocker → merged fix ${nums.median === undefined ? "n/a" : dur(nums.median)}`);
  } catch (e) { out.push(`GitHub: unavailable (${(e as Error).message.split("\n")[0]})`); }
  return o.json ? JSON.stringify({ summary: report?.summary, ...gh }, null, 2) : out.join("\n");
}
