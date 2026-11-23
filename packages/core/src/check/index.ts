import { randomInt } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CheckReport } from "../contracts/CheckReport.ts";
import type { Edge, Failure } from "../contracts/_common.ts";
import { laneOf, loadConfig, TEST_RE, writeOwnership, type LanesConfig } from "../config/index.ts";
import { graphFromReport, type IssuesCache } from "../graph-data/index.ts";
import { compareLock, entryFor, readLock, type LockEntry } from "../lock/index.ts";
import { cachePath, findRoot, listDir, readJson, sha256, mtime, writeJson } from "../util/fs.ts";
import { changedFiles, currentBranch, git, repoFiles } from "../util/git.ts";
import { matches } from "../util/glob.ts";
import { cliCommand, readBinding, readOverrides } from "../util/local.ts";
import type { EngineResult } from "./engine.ts";
import { runFiles, runVitest, writeEngineFiles } from "./vitest.ts";

export interface CheckOpts { cwd: string; lane?: string; fast?: boolean; ci?: boolean; seed?: number; ignoreLock?: boolean; skipOwnership?: boolean }
export interface CheckRun { report: CheckReport; exit: 0 | 1 | 2; root?: string; cfg?: LanesConfig; lockEntries: Map<string, LockEntry>; configError?: boolean }

const PRODUCER_SIDE = new Set(["schema", "fixture-valid", "fixture-invalid", "generated", "mutation", "handler-property"]);

function emptyReport(mode: CheckReport["mode"], seed: number, startedAt: number): CheckReport {
  return {
    v: 1, startedAt, durationMs: 0, mode, seed, edges: [], failures: [], warnings: [],
    lock: { ok: true, changed: [] }, ownership: { violations: [], overrides: [] },
    summary: { pass: 0, fail: 0, pending: 0, untested: 0 },
  };
}

export async function runCheck(opts: CheckOpts): Promise<CheckRun> {
  const startedAt = Date.now();
  const mode: CheckReport["mode"] = opts.ci ? "ci" : opts.fast ? "fast" : "local";
  const seed = opts.seed ?? randomInt(0, 2 ** 31 - 1);
  const report = emptyReport(mode, seed, startedAt);
  const root = findRoot(opts.cwd);
  const lockEntries = new Map<string, LockEntry>();
  const configFail = (message: string): CheckRun => {
    report.failures.push({ check: "config", message, owner: "approvers" });
    report.durationMs = Date.now() - startedAt;
    return { report, exit: 2, root, lockEntries, configError: true };
  };
  if (!root) return configFail("no lanes.yaml found here or in any parent directory; run `lanes init` first");
  const repro = cliCommand(root);
  // a nested lanes project (e.g. examples/*) is its own world
  const all = repoFiles(root);
  const nested = all.filter((f) => f.endsWith("/lanes.yaml")).map((f) => f.slice(0, -"lanes.yaml".length));
  const files = all.filter((f) => !nested.some((n) => f.startsWith(n)));
  const loaded = loadConfig(root, files);
  report.warnings.push(...loaded.warnings);
  if (!loaded.cfg || loaded.errors.length) {
    loaded.errors.forEach((e) => report.failures.push({ check: "config", message: e, owner: "approvers" }));
    report.durationMs = Date.now() - startedAt;
    return { report, exit: 2, root, cfg: loaded.cfg, lockEntries, configError: true };
  }
  const cfg = loaded.cfg;
  const map = writeOwnership(root, cfg);
  const binding = opts.ci ? undefined : readBinding(root);
  if (opts.lane && !cfg.lanes[opts.lane]) return configFail(`unknown lane "${opts.lane}" (lanes: ${Object.keys(cfg.lanes).join(", ")})`);
  const lane = opts.lane;
  if (lane) report.lane = lane;
  if (binding) report.ownership.lane = binding.lane;
  const branch = opts.ci ? (process.env.GITHUB_HEAD_REF || process.env.LANES_BRANCH || currentBranch(root)) : currentBranch(root);
  if (branch) report.branch = branch;
  const head = git(root, "rev-parse", "HEAD");
  if (head.code === 0) report.commit = head.stdout.trim();

  // 2. ownership (local only)
  if (!opts.ci && !opts.skipOwnership && binding) {
    const overrides = readOverrides(root);
    report.ownership.overrides = overrides.map((o) => ({ file: o.path, reason: o.reason }));
    for (const f of changedFiles(root)) {
      const owner = laneOf(map, f);
      if (!owner || owner === binding.lane) continue;
      if (overrides.some((o) => o.path === f || matches(f, [o.path]))) continue;
      report.ownership.violations.push({ file: f, owner });
      report.failures.push({ check: "ownership", file: f, owner: binding.lane, message: `${f} belongs to lane "${owner}" but you are in "${binding.lane}"; revert it and ask instead: ${repro} msg ${owner} --type request "<what you need>"` });
    }
  }

  // which contracts are in scope
  const inScope = Object.entries(cfg.contracts).filter(([, d]) => !lane || d.producer === lane || d.consumers.includes(lane)).map(([n]) => n);
  const { contracts_dir: cd, fixtures_dir: fd } = cfg.settings;
  const plan = {
    root, seed, runs: opts.fast ? Math.min(50, cfg.settings.property_runs) : cfg.settings.property_runs, repro,
    contracts: inScope.map((name) => ({
      name, file: `${cd}/${name}.ts`, producer: cfg.contracts[name].producer,
      valid: listDir(root, `${fd}/${name}/valid`).filter((f) => f.endsWith(".json")),
      invalid: listDir(root, `${fd}/${name}/invalid`).filter((f) => f.endsWith(".json")),
    })),
    handlers: Object.entries(cfg.handlers ?? {}).filter(([, h]) => h.lane === lane || (inScope.includes(h.output) && inScope.includes(h.input))).map(([name, h]) => {
      const [module, exportName] = h.module.split("#");
      return { name, lane: h.lane, module, exportName, input: h.input, output: h.output };
    }),
  };
  for (const c of plan.contracts) if (!existsSync(join(root, c.file))) report.failures.push({ check: "schema", contract: c.name, owner: c.producer, file: c.file, message: `${c.file} is missing; create it exporting \`schema\` and \`VERSION\`` });
  for (const h of plan.handlers) if (!existsSync(join(root, h.module))) report.failures.push({ check: "handler-property", contract: h.output, owner: h.lane, file: h.module, message: `handler ${h.name}: ${h.module} does not exist` });

  // consumer test discovery
  const tests: { file: string; contract: string; lane: string }[] = [];
  for (const f of files) {
    const m = TEST_RE.exec(f);
    if (!m || !existsSync(join(root, f))) continue;
    const owner = laneOf(map, f);
    if (!owner || !cfg.contracts[m[1]]) { report.warnings.push(`${f}: consumer test for ${cfg.contracts[m[1]] ? m[1] : `unknown contract ${m[1]}`} ${owner ? "" : "outside every lane "}is ignored`); continue; }
    if (!cfg.contracts[m[1]].consumers.includes(owner)) { report.warnings.push(`${f}: lane "${owner}" doesn't consume ${m[1]}; add it to contracts.${m[1]}.consumers or move the test`); continue; }
    if (inScope.includes(m[1])) tests.push({ file: f, contract: m[1], lane: owner });
  }

  // --fast: reuse consumer-test results whose inputs did not change
  const fastCache = readJson<Record<string, { key: string; tests: { title: string; status: string; failureMessages: string[] }[] }>>(cachePath(root, "consumer-cache.json")) ?? {};
  const keyOf = (t: typeof tests[number]) => {
    const c = plan.contracts.find((x) => x.name === t.contract)!;
    const laneFiles = files.filter((f) => matches(f, cfg.lanes[t.lane].paths));
    return sha256([t.file, c.file, ...c.valid, ...c.invalid, ...laneFiles].map((f) => `${f}:${mtime(join(root, f))}`).join("|"));
  };
  const toRun = tests.filter((t) => !opts.fast || fastCache[t.file]?.key !== keyOf(t));

  // 3–7: one vitest run (engine + consumer tests)
  const contractFiles = Object.fromEntries(plan.contracts.filter((c) => existsSync(join(root, c.file))).map((c) => [c.name, c.file]));
  const handlerFiles = Object.fromEntries(plan.handlers.filter((h) => existsSync(join(root, h.module))).map((h) => [h.name, h.module]));
  const rf = runFiles(root);
  writeEngineFiles(root, plan, contractFiles, handlerFiles, [`.lanes/cache/${rf.engine}`, ...toRun.map((t) => t.file)]);
  rmSync(rf.out, { force: true });
  const vt = runVitest(root);
  const engine = readJson<EngineResult>(rf.out);
  for (const tmp of [rf.engine, rf.config, rf.out, rf.json]) rmSync(tmp.includes("/") ? tmp : cachePath(root, tmp), { force: true });
  if (!vt.ok) return configFail(vt.error!);
  const engineFile = vt.files.find((f) => f.file.endsWith(rf.engine));
  if (!engine) return configFail(`the lanes engine did not run: ${(engineFile?.message ?? engineFile?.tests[0]?.failureMessages[0] ?? "no output").split("\n")[0]}`);
  report.failures.push(...engine.failures);
  report.warnings.push(...engine.warnings);

  const testCounts = new Map<string, number>();
  for (const t of tests) {
    const res = vt.files.find((f) => f.file === t.file);
    const results = res ? res.tests : fastCache[t.file]?.tests ?? [];
    if (res) fastCache[t.file] = { key: keyOf(t), tests: res.tests };
    testCounts.set(`${t.contract}:${t.lane}`, (testCounts.get(`${t.contract}:${t.lane}`) ?? 0) + results.length);
    const base = { check: "consumer-test" as const, contract: t.contract, owner: t.lane, file: t.file, repro: `npx vitest run ${t.file}` };
    if (res && res.status === "failed" && !res.tests.length) report.failures.push({ ...base, message: `${t.file} failed to run: ${(res.message ?? "unknown error").split("\n")[0]}`, detail: res.message });
    for (const r of results.filter((x) => x.status === "failed"))
      report.failures.push({ ...base, message: `${t.file}: "${r.title}" failed against ${t.contract} fixtures`, detail: r.failureMessages[0]?.split("\n").slice(0, 6).join("\n") });
  }
  writeJson(cachePath(root, "consumer-cache.json"), fastCache);

  // 8. lock
  for (const c of engine.contracts) {
    if (!c.loaded) continue;
    const pc = plan.contracts.find((x) => x.name === c.name)!;
    const byLane: Record<string, string[]> = {};
    for (const t of tests.filter((x) => x.contract === c.name)) (byLane[t.lane] ??= []).push(t.file);
    lockEntries.set(c.name, entryFor(root, { name: c.name, version: c.version!, jsonSchema: c.jsonSchema, fixtures: [...pc.valid, ...pc.invalid], tests: byLane }));
  }
  if (!opts.ignoreLock) {
    const cmp = compareLock(root, cfg, readLock(root), lockEntries, branch, repro);
    report.lock = { ok: cmp.ok, changed: cmp.changed, ...(cmp.classification ? { classification: cmp.classification, reasons: cmp.reasons } : {}) };
    report.failures.push(...cmp.failures);
    if (cmp.setup) report.warnings.push(`setup phase: no ${"contracts.lock"} yet; run \`${repro} lock\` once everything is green`);
  }

  // 9. edges
  const issues = readJson<IssuesCache>(cachePath(root, "issues.json"))?.issues ?? [];
  for (const name of inScope) {
    const def = cfg.contracts[name];
    const ec = engine.contracts.find((c) => c.name === name);
    for (const consumer of def.consumers) {
      const failures = report.failures.filter((f) => f.contract === name && (PRODUCER_SIDE.has(f.check) || f.owner === consumer || (f.check === "lock" && f.owner === def.producer)));
      const pendingIssues = issues.filter((i) => i.state === "open" && i.labels.includes("lanes:request") && i.meta?.contract === name).map((i) => i.number);
      const consumerTests = testCounts.get(`${name}:${consumer}`) ?? 0;
      const hasTest = tests.some((t) => t.contract === name && t.lane === consumer);
      const status: Edge["status"] = failures.length ? "fail" : pendingIssues.length ? "pending" : !hasTest ? "untested" : "pass";
      report.edges.push({
        contract: name, producer: def.producer, consumer, status, version: ec?.version ?? "?",
        fixtures: ec?.fixtures ?? { valid: 0, invalid: 0 }, consumerTests, failures, pendingIssues,
      });
    }
  }
  for (const e of report.edges) report.summary[e.status]++;
  report.durationMs = Date.now() - startedAt;

  // 10. outputs
  writeJson(cachePath(root, "report.json"), report);
  const owners = Object.fromEntries(Object.entries(cfg.lanes).map(([l, d]) => [l, d.owner]));
  writeJson(cachePath(root, "graph.json"), graphFromReport(report, { owners, issues }));
  return { report, exit: report.failures.length ? 1 : 0, root, cfg, lockEntries };
}

// ---- human output ----
const ICON: Record<Edge["status"], string> = { pass: "✅ pass    ", fail: "❌ fail    ", pending: "⏳ pending ", untested: "○  untested" };

export function formatReport(r: CheckReport, exit: number): string {
  const out: string[] = [];
  out.push(`lanes check · ${r.mode}${r.lane ? ` · lane ${r.lane}` : ""}${r.branch ? ` · ${r.branch}` : ""} · seed ${r.seed}`);
  const w = Math.max(8, ...r.edges.map((e) => e.contract.length));
  for (const e of r.edges) {
    out.push(`${ICON[e.status]}  ${e.contract.padEnd(w)}  ${e.producer} → ${e.consumer}  v${e.version} · fixtures ${e.fixtures.valid} valid/${e.fixtures.invalid} invalid · ${e.consumerTests} consumer test(s)${e.pendingIssues.length ? ` · pending #${e.pendingIssues.join(", #")}` : ""}`);
  }
  const fl = r.failures;
  if (fl.length) {
    out.push("", `Failures (${fl.length}):`);
    for (const f of fl) {
      out.push(`  ✗ [${f.check}]${f.contract ? ` ${f.contract}` : ""} · owner ${f.owner}: ${f.message}`);
      if (f.seed !== undefined) out.push(`      seed: ${f.seed}`);
      if (f.counterexample !== undefined) out.push(`      counterexample: ${JSON.stringify(f.counterexample)}`);
      if (f.detail && f.check !== "handler-property") out.push(...f.detail.split("\n").slice(0, 4).map((l) => `      ${l}`));
      if (f.repro) out.push(`      repro: ${f.repro}`);
    }
  }
  if (r.lock.classification) out.push("", `Contract change: ${r.lock.classification.toUpperCase()}`, ...(r.lock.reasons ?? []).map((x) => `  - ${x}`));
  if (r.warnings.length) out.push("", "Warnings:", ...r.warnings.map((x) => `  ! ${x}`));
  const s = r.summary;
  out.push("", `✅ ${s.pass} pass · ❌ ${s.fail} fail · ⏳ ${s.pending} pending · ○ ${s.untested} untested   (${(r.durationMs / 1000).toFixed(1)}s, exit ${exit})`);
  return out.join("\n");
}
