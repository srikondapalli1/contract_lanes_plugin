// `lanes fix <n>`: claim + lease + isolated worktree; --submit runs the gates and queues a PR; --escalate hands to the owner.
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { FixPlan } from "../contracts/FixPlan.ts";
import type { FixResult } from "../contracts/FixResult.ts";
import type { IssueMeta } from "../contracts/IssueMeta.ts";
import { buildOwnership, laneOf, loadConfig, type LanesConfig } from "../config/index.ts";
import { findRoot } from "../util/fs.ts";
import { matches } from "../util/glob.ts";
import { git, gitOk } from "../util/git.ts";
import { cliCommand, selfExec, writeBinding } from "../util/local.ts";
import { addLabels, api, autopilotOn, botComment, handle, labelNames, list, parseMeta, removeLabel, repoSlug, withMeta } from "../github/index.ts";

export const MAIN_REF = "+refs/heads/main:refs/remotes/origin/main";
const me = () => process.env.LANES_ME ?? process.env.USER ?? "agent";
const out = (o: FixPlan | FixResult) => process.stdout.write(JSON.stringify(o) + "\n");

/** The main worktree (where lanes.yaml lives with .git dir), even when called from a fix worktree. */
function mainRoot(root: string): string {
  const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim();
  return common && basename(common) === ".git" ? dirname(common) : root;
}
export const worktreeFor = (root: string, lane: string, n: number) => resolve(root, "..", `${basename(root)}-${lane}-fix-${n}`);

function issueLane(issue: any, meta: IssueMeta | undefined, cfg: LanesConfig): string | undefined {
  const l = meta?.to && cfg.lanes[meta.to] ? meta.to : labelNames(issue).find((x) => x.startsWith("lane:"))?.slice(5);
  return l && cfg.lanes[l] ? l : undefined;
}

export function escalate(repo: string, cfg: LanesConfig, n: number, lane: string, reason: string, meta?: IssueMeta, body?: string): FixResult {
  addLabels(repo, n, ["needs-owner"]);
  removeLabel(repo, n, "claimed");
  const owner = handle(cfg.lanes[lane]?.owner ?? cfg.approvers[0] ?? "");
  try { if (owner) api("POST", `/repos/${repo}/issues/${n}/assignees`, { assignees: [owner] }); } catch { /* not a collaborator */ }
  if (meta && body !== undefined) { const { lease: _, ...m } = meta; api("PATCH", `/repos/${repo}/issues/${n}`, { body: withMeta(body, m) }); }
  botComment(repo, n, `Escalated to @${owner} (needs-owner): ${reason}`);
  return { v: 1, issue: n, outcome: "escalated", reasons: [reason] };
}

export async function fixCommand(cwd: string, arg: string | undefined, o: { submit?: boolean; escalate?: string; cleanup?: boolean }): Promise<number> {
  const here = findRoot(cwd);
  if (!here) { process.stderr.write("lanes fix: no lanes.yaml\n"); return 2; }
  const root = mainRoot(here);
  const cfg = loadConfig(root).cfg;
  if (!cfg) { process.stderr.write("lanes fix: invalid lanes.yaml\n"); return 2; }
  const repo = repoSlug(root);
  if (o.cleanup) return cleanup(root, repo);
  const n = Number(arg);
  if (!n) { process.stderr.write("usage: lanes fix <issue> [--submit | --escalate \"reason\" | --cleanup]\n"); return 2; }
  const issue = api("GET", `/repos/${repo}/issues/${n}`).data;
  const meta = parseMeta(issue.body);
  const lane = issueLane(issue, meta, cfg);
  if (!lane) { process.stderr.write(`lanes fix: #${n} is not addressed to a lane (no lane:<name> label)\n`); return 2; }
  if (o.escalate !== undefined) { out(escalate(repo, cfg, n, lane, o.escalate || "fixer gave up", meta, issue.body)); return 0; }
  if (o.submit) return submit(root, repo, cfg, n, lane, issue, meta);

  // claim
  if (!autopilotOn(repo, cfg)) { process.stderr.write(`lanes fix: autopilot is off (lanes.yaml or the Lanes control issue). Tell the human about #${n} instead of fixing it.\n`); return 1; }
  const attempts = meta?.attempts ?? 0;
  if (attempts >= cfg.settings.fix_attempts && !(meta?.lease && meta.lease.by === me() && meta.lease.until > Date.now())) { out(escalate(repo, cfg, n, lane, `${attempts} fix attempts used (fix_attempts = ${cfg.settings.fix_attempts})`, meta, issue.body)); return 1; }
  if (meta?.lease && meta.lease.until > Date.now() && meta.lease.by !== me()) {
    process.stderr.write(`lanes fix: #${n} is claimed by ${meta.lease.by} until ${new Date(meta.lease.until).toISOString()}; leave it to them\n`);
    return 1;
  }
  const leaseUntil = Date.now() + cfg.settings.lease_minutes * 60_000;
  const resuming = !!meta?.lease && meta.lease.until > Date.now() && meta.lease.by === me(); // re-claim after a crash isn't a new attempt
  const attempt = resuming ? Math.max(attempts, 1) : attempts + 1;
  const newMeta: IssueMeta = { ...(meta ?? { v: 1, type: "blocker", to: lane as IssueMeta["to"], from: "human", key: `blocker:issue:${n}` }), attempts: attempt, lease: { by: me(), until: leaseUntil } };
  api("PATCH", `/repos/${repo}/issues/${n}`, { body: withMeta(issue.body ?? "", newMeta) });
  addLabels(repo, n, ["claimed"]);
  botComment(repo, n, `${resuming ? "Lease renewed" : "Claimed"} by \`${me()}\` until ${new Date(leaseUntil).toISOString()} (attempt ${attempt}/${cfg.settings.fix_attempts}).`);

  // isolated worktree from origin/main
  const wt = worktreeFor(root, lane, n);
  const branch = `fix/${n}`;
  git(root, "fetch", "-q", "origin", MAIN_REF); // explicit refspec: some clones have no default fetch refspec
  if (!existsSync(wt)) gitOk(root, "worktree", "add", "-q", "-B", branch, wt, "origin/main");
  if (existsSync(join(root, "node_modules")) && !existsSync(join(wt, "node_modules"))) {
    symlinkSync(join(root, "node_modules"), join(wt, "node_modules"), "dir");
    // "node_modules/" in .gitignore doesn't match a symlink; keep it out of fix commits
    const exclude = join(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim(), "info", "exclude");
    if (!(existsSync(exclude) && readFileSync(exclude, "utf8").includes("/node_modules\n"))) { mkdirSync(dirname(exclude), { recursive: true }); appendFileSync(exclude, "\n/node_modules\n"); }
  }
  writeBinding(wt, { v: 1, lane, boundAt: Date.now() });
  const repro = meta?.failure?.repro ?? `${cliCommand(root)} check --lane ${lane}`;
  out({ v: 1, issue: n, lane, worktree: wt, branch, repro: `cd ${wt} && ${repro}`, leaseUntil, attempt });
  return 0;
}

async function submit(root: string, repo: string, cfg: LanesConfig, n: number, lane: string, issue: any, meta: IssueMeta | undefined): Promise<number> {
  const wt = worktreeFor(root, lane, n);
  if (!existsSync(wt)) { process.stderr.write(`lanes fix --submit: no worktree at ${wt}; run lanes fix ${n} first\n`); return 2; }
  const reasons: string[] = [];
  // gate 1: check passes (in the worktree)
  const chk = selfExec(["check", "--lane", lane, "--json"], wt);
  if (chk.code !== 0) {
    let first = "";
    try { first = JSON.parse(chk.stdout).failures?.[0]?.message ?? ""; } catch { first = chk.stderr.trim().split("\n")[0]; }
    out({ v: 1, issue: n, outcome: "rejected", reasons: [`lanes check --lane ${lane} is still red: ${first}`] });
    return 1;
  }
  // commit anything uncommitted
  git(wt, "add", "-A", "--", ".", ":!node_modules");
  if (git(wt, "diff", "--cached", "--quiet").code !== 0) gitOk(wt, "commit", "-q", "-m", `fix(${lane}): ${issue.title.replace(/^❌\s*/, "")}\n\nFixes #${n}`);
  const diff = git(wt, "diff", "--numstat", "origin/main...HEAD").stdout.trim().split("\n").filter(Boolean).map((l) => { const [a, d, f] = l.split("\t"); return { f, lines: (Number(a) || 0) + (Number(d) || 0) }; });
  if (!diff.length) { out({ v: 1, issue: n, outcome: "rejected", reasons: ["no changes to submit"] }); return 1; }
  const map = buildOwnership(root, cfg);
  const outside = diff.filter((d) => laneOf(map, d.f) !== lane);
  if (outside.length) reasons.push(`diff leaves lane "${lane}": ${outside.map((d) => d.f).join(", ")}`);
  const locked = diff.filter((d) => map.lockPresent && matches(d.f, map.locked));
  if (locked.length) reasons.push(`touched locked file(s): ${locked.map((d) => d.f).join(", ")}`);
  const total = diff.reduce((s, d) => s + d.lines, 0);
  if (total > cfg.settings.fix_size_cap) reasons.push(`diff ${total} lines > cap ${cfg.settings.fix_size_cap}`);
  if (reasons.length) { out(escalate(repo, cfg, n, lane, `fix gates failed: ${reasons.join("; ")}`, meta, issue.body)); return 1; }
  gitOk(wt, "push", "-q", "-u", "origin", `HEAD:refs/heads/fix/${n}`);
  const pr = api("POST", `/repos/${repo}/pulls`, { title: `fix(${lane}): ${issue.title.replace(/^❌\s*/, "")}`, head: `fix/${n}`, base: "main", body: `Fixes #${n}\n\nAutonomous fix by \`${me()}\` in lane \`${lane}\`: ${diff.length} file(s), ${total} line(s). Gates: check green, lane-only, no locked files, ≤ ${cfg.settings.fix_size_cap} lines.` }).data;
  addLabels(repo, pr.number, ["queue", `lane:${lane}`, "auto-fix"]);
  botComment(repo, n, `Fix queued: #${pr.number}`);
  out({ v: 1, issue: n, outcome: "queued", pr: pr.number });
  return 0;
}

function cleanup(root: string, repo: string): number {
  const wts = git(root, "worktree", "list", "--porcelain").stdout.split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9));
  let removed = 0;
  for (const wt of wts) {
    const m = /-fix-(\d+)$/.exec(wt);
    if (!m) continue;
    const n = Number(m[1]);
    let done = false;
    try { done = api("GET", `/repos/${repo}/issues/${n}`).data.state === "closed"; } catch { /* keep */ }
    if (!done) { try { done = list(`/repos/${repo}/pulls?state=closed&head=${encodeURIComponent(`${repo.split("/")[0]}:fix/${n}`)}`).some((p: any) => p.merged_at); } catch { /* keep */ } }
    if (!done) continue;
    git(root, "worktree", "remove", "--force", wt);
    git(root, "branch", "-D", `fix/${n}`);
    removed++;
    process.stdout.write(`removed ${wt}\n`);
  }
  process.stdout.write(`cleanup: ${removed} worktree(s) removed\n`);
  return 0;
}

