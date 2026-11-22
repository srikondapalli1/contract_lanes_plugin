// `lanes queue`: stateless merge queue. Labels are the queue; each run processes ALL queued PRs (SPEC §12).
import type { CheckReport } from "../contracts/CheckReport.ts";
import type { IssueMeta } from "../contracts/IssueMeta.ts";
import { buildOwnership, laneOf, loadConfig, type LanesConfig } from "../config/index.ts";
import { findRoot } from "../util/fs.ts";
import { git, gitOk } from "../util/git.ts";
import { selfExec } from "../util/local.ts";
import { renderPrComment } from "../status/prComment.ts";
import { addLabels, api, autopilotOn, botComment, fileBlocker, handle, labelNames, list, overridesFromCommits, parseMeta, prCommentData, removeLabel, repoSlug, setStatus, upsertIssue, upsertPrComment, withMeta } from "../github/index.ts";
import { escalate } from "../fix/index.ts";

const log = (s: string) => process.stdout.write(s + "\n");
const FIXES_RE = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;
export const linkedIssues = (body: string | null) => [...String(body ?? "").matchAll(FIXES_RE)].map((m) => Number(m[1]));

function check(root: string, head?: string): CheckReport | undefined {
  const r = selfExec(["check", "--ci", "--json"], root, head ? { GITHUB_HEAD_REF: head } : { GITHUB_HEAD_REF: "" });
  try { return JSON.parse(r.stdout); } catch { log(`  check produced no report: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ")}`); return undefined; }
}

export async function queue(cwd: string, o: { budgetMin: number }): Promise<number> {
  const root = findRoot(cwd);
  if (!root) { process.stderr.write("lanes queue: no lanes.yaml\n"); return 2; }
  const repo = repoSlug(root);
  const deadline = Date.now() + o.budgetMin * 60_000;
  const done = new Set<number>();
  while (Date.now() < deadline) {
    const prs = list(`/repos/${repo}/pulls?state=open&sort=created&direction=asc`).filter((p: any) =>
      !p.draft && p.head?.repo?.full_name === repo && labelNames(p).includes("queue") && !labelNames(p).includes("queue-blocked") && !done.has(p.number));
    if (!prs.length) break;
    const pr = prs[0];
    done.add(pr.number);
    log(`queue: #${pr.number} ${pr.title} (${pr.head.ref})`);
    try { processPr(root, repo, pr); } catch (e) { log(`  error: ${(e as Error).message}`); }
    git(root, "checkout", "-q", "--detach", "origin/main");
  }
  log(`queue: done (${done.size} PR(s) processed)`);
  return 0;
}

function processPr(root: string, repo: string, pr: any) {
  const n = pr.number, head = pr.head.ref;
  const comment = (state: Parameters<typeof prCommentData>[2]["state"], report?: CheckReport, reason?: string) => {
    const r = report ?? ({ summary: { pass: 0, fail: 0, pending: 0, untested: 0 }, edges: [], lock: { ok: true, changed: [] } } as unknown as CheckReport);
    upsertPrComment(repo, n, renderPrComment(prCommentData(r, overridesFromCommits(repo, n), { state, ...(reason ? { reason } : {}) })));
  };
  comment("rebasing");
  gitOk(root, "fetch", "-q", "origin", "main", `+refs/heads/${head}:refs/remotes/origin/${head}`);
  gitOk(root, "checkout", "-q", "-B", "lanes-queue", `origin/${head}`);
  if (git(root, "rebase", "-q", "origin/main").code !== 0) {
    git(root, "rebase", "--abort");
    addLabels(repo, n, ["queue-blocked"]);
    const why = `conflicts with main; rebase \`${head}\` onto main and push (the queue retries automatically)`;
    botComment(repo, n, `⛔ Queue blocked: ${why}.`);
    comment("blocked", undefined, why);
    const lane = labelNames(pr).find((l) => l.startsWith("lane:"))?.slice(5);
    if (lane) upsertIssue(repo, { meta: { v: 1, type: "blocker", to: lane as IssueMeta["to"], from: "ci", key: `blocker:queue:conflict:${n}` }, title: `⛔ PR #${n} conflicts with main`, text: `PR #${n} (\`${head}\`) ${why}.`, labels: ["lanes:blocker", `lane:${lane}`] });
    log("  blocked: rebase conflict");
    return;
  }
  comment("checking");
  const cfg = loadConfig(root).cfg as LanesConfig;
  const report = check(root, head);
  const files = git(root, "diff", "--name-only", "origin/main...HEAD").stdout.split("\n").filter(Boolean);
  const reasons: string[] = report ? report.failures.map((f) => `[${f.check}] ${f.message}`) : ["lanes check did not produce a report"];
  if (cfg && report) {
    const map = buildOwnership(root, cfg);
    const counts = new Map<string, number>();
    files.forEach((f) => { const l = laneOf(map, f); if (l) counts.set(l, (counts.get(l) ?? 0) + 1); });
    const prLane = labelNames(pr).find((l) => l.startsWith("lane:"))?.slice(5) ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const latest = new Map<string, string>();
    for (const r of list(`/repos/${repo}/pulls/${n}/reviews`)) latest.set(r.user?.login, r.state);
    const approved = (h: string) => latest.get(handle(h)) === "APPROVED";
    for (const l of counts.keys()) if (l !== prLane && !approved(cfg.lanes[l].owner))
      reasons.push(`touches lane "${l}" (${files.filter((f) => laneOf(map, f) === l).join(", ")}) without an approving review from ${cfg.lanes[l].owner}`);
    if (files.includes("contracts.lock") && !head.startsWith("contract/")) reasons.push("contracts.lock changed outside a contract/* branch");
    if (report.lock.classification === "major" && !cfg.approvers.some(approved)) reasons.push(`major contract change needs an approving review from ${cfg.approvers.join(" or ")}`);
  }
  if (reasons.length) return red(root, repo, cfg, pr, reasons, report, comment);

  // green: relock / codeowners inside the PR so main stays consistent, then merge exactly this SHA
  if (report!.lock.classification) {
    const l = selfExec(["lock", "--allow-open", "999"], root);
    if (l.code !== 0) return red(root, repo, cfg, pr, [`relock failed: ${l.stdout.trim().split("\n").pop()}`], report, comment);
    git(root, "add", "contracts.lock");
    git(root, "commit", "-q", "-m", `lanes: relock (${report!.lock.classification})`);
  }
  if (files.includes("lanes.yaml")) {
    selfExec(["codeowners"], root);
    git(root, "add", ".github/CODEOWNERS");
    if (git(root, "diff", "--cached", "--quiet").code !== 0) git(root, "commit", "-q", "-m", "lanes: regenerate CODEOWNERS");
  }
  const sha = gitOk(root, "rev-parse", "HEAD");
  if (sha !== pr.head.sha) gitOk(root, "push", "-q", `--force-with-lease=${head}:${pr.head.sha}`, "origin", `HEAD:refs/heads/${head}`);
  setStatus(repo, sha, true, "queue: green on latest main");
  try {
    api("PUT", `/repos/${repo}/pulls/${n}/merge`, { merge_method: "squash", sha, commit_title: `${pr.title} (#${n})` });
  } catch (e) { return red(root, repo, cfg, pr, [`merge refused by GitHub: ${(e as Error).message}`], report, comment); }
  log(`  merged #${n}`);
  comment("merged", report!);
  afterMerge(root, repo, pr, report!, files);
}

function red(root: string, repo: string, cfg: LanesConfig | undefined, pr: any, reasons: string[], report: CheckReport | undefined, comment: (s: any, r?: CheckReport, why?: string) => void) {
  const n = pr.number;
  addLabels(repo, n, ["queue-failed"]);
  removeLabel(repo, n, "queue");
  botComment(repo, n, `❌ Queue: not merged after re-checking against the latest main.\n\n${reasons.slice(0, 12).map((r) => `- ${r}`).join("\n")}\n\nFix and re-add the \`queue\` label.`);
  comment("failed", report, reasons[0]);
  try { setStatus(repo, pr.head.sha, false, reasons[0]); } catch { /* best effort */ }
  for (const i of linkedIssues(pr.body)) {
    try {
      const issue = api("GET", `/repos/${repo}/issues/${i}`).data;
      const meta = parseMeta(issue.body);
      if (!meta || !cfg) continue;
      const attempts = meta.attempts ?? 1;
      const { lease: _, ...rest } = meta;
      api("PATCH", `/repos/${repo}/issues/${i}`, { body: withMeta(issue.body, { ...rest, attempts }) });
      removeLabel(repo, i, "claimed");
      if (attempts >= cfg.settings.fix_attempts && cfg.lanes[meta.to]) escalate(repo, cfg, i, meta.to, `fix PR #${n} failed in the queue and ${attempts}/${cfg.settings.fix_attempts} attempts are used: ${reasons[0]}`);
      else botComment(repo, i, `Fix PR #${n} failed in the queue (attempt ${attempts}/${cfg.settings.fix_attempts}): ${reasons[0]}. Claim released.`);
    } catch (e) { log(`  could not update #${i}: ${(e as Error).message}`); }
  }
  log(`  failed: ${reasons[0]}`);
  void root;
}

function afterMerge(root: string, repo: string, pr: any, report: CheckReport, files: string[]) {
  // GITHUB_TOKEN merges don't trigger workflows, so do the post-merge work here.
  gitOk(root, "fetch", "-q", "origin", "main");
  gitOk(root, "checkout", "-q", "--detach", "origin/main");
  const cfg = loadConfig(root).cfg as LanesConfig;
  for (const i of linkedIssues(pr.body)) {
    try { botComment(repo, i, `Fixed by #${pr.number} (merged by the queue).`); api("PATCH", `/repos/${repo}/issues/${i}`, { state: "closed" }); removeLabel(repo, i, "claimed"); } catch { /* already closed */ }
  }
  if (!cfg) return;
  const touched = new Set(files.map((f) => new RegExp(`^${cfg.settings.fixtures_dir}/([A-Z][A-Za-z0-9]*)/`).exec(f)?.[1]).filter(Boolean));
  for (const req of list(`/repos/${repo}/issues?state=open&labels=lanes:request`)) {
    const m = parseMeta(req.body);
    if (m?.contract && touched.has(m.contract)) { botComment(repo, req.number, `Fixtures for ${m.contract} landed in #${pr.number}; closing this request.`); api("PATCH", `/repos/${repo}/issues/${req.number}`, { state: "closed" }); }
  }
  if (report.lock.classification === "minor") for (const c of report.lock.changed) for (const consumer of cfg.contracts[c]?.consumers ?? [])
    upsertIssue(repo, { meta: { v: 1, type: "notice", to: consumer as IssueMeta["to"], from: "ci", contract: c, key: `notice:relock:${c}:${pr.number}` }, title: `[notice] ${c} relocked (minor) by #${pr.number}`, text: `${c} changed compatibly in #${pr.number}:\n${(report.lock.reasons ?? []).map((r) => `- ${r}`).join("\n")}`, labels: ["lanes:notice", `lane:${consumer}`] });
  const main = check(root);
  if (!main) return;
  const auto = autopilotOn(repo, cfg);
  for (const f of main.failures) if (f.contract && cfg.lanes[f.owner]) {
    const r = fileBlocker(root, repo, cfg, f, auto, main.commit);
    log(`  main is red after #${pr.number}: ${r.created ? "filed" : "updated"} blocker #${r.number}`);
  }
}
