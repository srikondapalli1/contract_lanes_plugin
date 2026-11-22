// Benchmark 2: bug-catch rate (mutation study) on examples/three-lanes.
// Baseline = the example with the planted bug fixed (spooked holdMs 1200). Each mutant seeds ONE realistic bug on the
// producer side (brain's tick handler) or in the producer's contract/fixtures, then every approach runs on it:
//   lanes      `lanes check --json --seed s` (fixtures + generated + mutation + handler property + consumer tests), SEEDS seeds
//   lanesFast  `lanes check --fast --json --seed s` (50 property runs), SEEDS seeds
//   pact       Pact consumer test (world) + provider verification (brain over HTTP), bench/alternatives/pact
//   examples   hand-written vitest: the repo's consumer tests + a zod test replaying the valid fixtures (bench/alternatives/zod-vitest)
//   tsc        `tsc --noEmit --strict` over contracts/ and apps/ (types only)
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { BENCH, LANES_BIN, REPO, WORK, exampleRepo, replaceIn, round, saveResult, sh, tmp } from "./lib.mjs";

const SEEDS = Number(process.env.SEEDS ?? 10);
const POOL = Number(process.env.POOL ?? 4);
const ONLY = process.env.ONLY?.split(",");
const run = promisify(execFile);

const TICK = "apps/brain/src/tick.ts";
const RESP = "contracts/TickResponse.ts";
const t = (from, to) => (d) => replaceIn(join(d, TICK), from, to);
const fixed = (d) => replaceIn(join(d, TICK), "holdMs: 1800 };", "holdMs: 1200 };");

/** Each mutant: id, what it is, which inputs trigger it, and the edit (applied on top of the fixed baseline). */
export const MUTANTS = [
  { id: "hold-1800", cat: "range", desc: "spooked holdMs 1800 (the example's planted bug; max 1500)", trigger: "any spooked agent", edit: t("holdMs: 1200 };", "holdMs: 1800 };") },
  { id: "hold-off-by-one", cat: "range", desc: "spooked holdMs 1501 (off by one)", trigger: "any spooked agent", edit: t("holdMs: 1200 };", "holdMs: 1501 };") },
  { id: "hold-negative", cat: "range", desc: "calm holdMs = 250 - 5·x (negative when x > 50)", trigger: "calm agent with x > 50", edit: t('kind: "wait", holdMs: 250', 'kind: "wait", holdMs: 250 - a.at.x * 5') },
  { id: "hold-float", cat: "type-refinement", desc: "curious holdMs = 400 + x/2 (non-integer for odd x)", trigger: "curious agent with odd x", edit: t("y: a.at.y }, holdMs: 400", "y: a.at.y }, holdMs: 400 + a.at.x / 2") },
  { id: "crowded-hold", cat: "rare-input", desc: "calm holdMs = 140 · agents.length (> 1500 with 11-12 agents)", trigger: "calm agent in a world of 11-12 agents", edit: t('kind: "wait", holdMs: 250', 'kind: "wait", holdMs: 140 * req.agents.length') },
  { id: "haunt-rare", cat: "rare-input", desc: "curious holdMs 2000 when any haunt has intensity > 9", trigger: "curious agent + haunt intensity > 9", edit: t("y: a.at.y }, holdMs: 400", "y: a.at.y }, holdMs: (req.haunts ?? []).some((h) => h.intensity > 9) ? 2000 : 400") },
  { id: "to-no-clamp-high", cat: "range", desc: "curious move forgets clamp (x = 64 at the east edge)", trigger: "curious agent with x = 63", edit: t("to: { x: clamp(a.at.x + 1), y: a.at.y }", "to: { x: a.at.x + 1, y: a.at.y }") },
  { id: "to-no-clamp-low", cat: "range", desc: "spooked flee forgets clamp (negative x/y near the origin)", trigger: "spooked agent with x < 2 or y < 2", edit: t("to: { x: clamp(a.at.x - 2), y: clamp(a.at.y - 2) }", "to: { x: a.at.x - 2, y: a.at.y - 2 }") },
  { id: "to-float", cat: "type-refinement", desc: "curious move x = clamp(1.5·x) (non-integer for odd x)", trigger: "curious agent with odd x", edit: t("to: { x: clamp(a.at.x + 1), y: a.at.y }", "to: { x: clamp(a.at.x * 1.5), y: a.at.y }") },
  { id: "kind-typo", cat: "enum", desc: 'curious kind "walk" (not in enum)', trigger: "any curious agent", edit: t('kind: "move"', 'kind: "walk"') },
  { id: "missing-agentId", cat: "shape", desc: "calm action drops agentId", trigger: "any calm agent", edit: t('return { agentId: a.id, kind: "wait"', 'return { kind: "wait"') },
  { id: "agentId-format", cat: "format", desc: 'calm agentId upper-cased ("A-1" fails the regex)', trigger: "any calm agent", edit: t('return { agentId: a.id, kind: "wait"', 'return { agentId: a.id.toUpperCase(), kind: "wait"') },
  { id: "tick-echo", cat: "semantic", desc: "response tick = request tick + 1 (schema-valid)", trigger: "every request", edit: t("tick: req.tick,", "tick: req.tick + 1,") },
  { id: "drop-agent", cat: "semantic", desc: "skips the first agent (schema-valid)", trigger: "any non-empty world", edit: t("actions: req.agents.map(", "actions: req.agents.slice(1).map(") },
  { id: "crash-no-haunts", cat: "crash", desc: "curious hold reads req.haunts![0] (throws when there are no haunts)", trigger: "curious agent, no haunts", edit: t("y: a.at.y }, holdMs: 400", "y: a.at.y }, holdMs: 400 + Math.round(req.haunts![0].intensity * 10)") },
  { id: "crash-empty-world", cat: "crash", desc: "reads req.agents[0] up front (throws on an empty world)", trigger: "no agents", edit: t("export function tick(req: TickRequest): TickResponse {\n  return {", "export function tick(req: TickRequest): TickResponse {\n  const lead = req.agents[0].at;\n  void lead;\n  return {") },
  { id: "schema-loosened", cat: "contract", desc: "producer loosens holdMs max to 2000 (and emits 1800); world still throws above 1500", trigger: "any spooked agent (world breaks at runtime)", edit: (d) => { replaceIn(join(d, RESP), "holdMs: z.int().min(0).max(1500)", "holdMs: z.int().min(0).max(2000)"); replaceIn(join(d, TICK), "holdMs: 1200 };", "holdMs: 1800 };"); } },
  { id: "bad-valid-fixture", cat: "contract", desc: "producer adds a 'valid' TickResponse fixture with holdMs 1600", trigger: "fixture itself", edit: (d) => writeFileSync(join(d, "fixtures/TickResponse/valid/spooked.json"), JSON.stringify({ tick: 7, actions: [{ agentId: "a-9", kind: "flee", to: { x: 3, y: 3 }, holdMs: 1600 }] }) + "\n") },
  { id: "required-field", cat: "contract", desc: "producer adds required action.reason to the schema but the handler never emits it", trigger: "every non-empty response", edit: (d) => { replaceIn(join(d, RESP), "holdMs: z.int().min(0).max(1500),", "holdMs: z.int().min(0).max(1500),\n    reason: z.string(),"); replaceIn(join(d, RESP), 'VERSION = "1.0.0"', 'VERSION = "1.1.0"'); } },
];

// ---------- approaches ----------
async function lanesCheck(dir, seed, fast) {
  const args = [LANES_BIN, "check", "--json", "--seed", String(seed), ...(fast ? ["--fast"] : [])];
  const t0 = performance.now();
  let stdout = "", code = 0;
  try { ({ stdout } = await run(process.execPath, args, { cwd: dir, maxBuffer: 32 << 20, env: { ...process.env, LANES_CLI: "npx lanes" } })); }
  catch (e) { stdout = e.stdout ?? ""; code = e.code ?? 1; }
  const ms = performance.now() - t0;
  let rep; try { rep = JSON.parse(stdout); } catch { rep = null; }
  const failures = rep?.failures ?? [];
  const real = failures.filter((f) => f.check !== "config");
  return { seed, code, ms: round(ms), caught: code === 1 && real.length > 0, kinds: [...new Set(failures.map((f) => f.check ?? "?"))], first: real[0] ? (real[0].message ?? "").slice(0, 160) : undefined, shrunk: real[0]?.counterexample, config: failures.filter((f) => f.check === "config").map((f) => f.message), error: rep ? undefined : stdout.slice(0, 300) };
}

const ZOD_TEST = readFileSync(join(BENCH, "alternatives/zod-vitest/tick.zod.test.ts"), "utf8");
const TSCONFIG = readFileSync(join(BENCH, "alternatives/tsc/tsconfig.json"), "utf8");
async function examplesOnly(dir) {
  writeFileSync(join(dir, "apps/brain/src/tick.zod.test.ts"), ZOD_TEST);
  try { await run(process.execPath, [join(REPO, "node_modules/vitest/vitest.mjs"), "run", "--reporter=dot"], { cwd: dir, maxBuffer: 32 << 20 }); return { caught: false }; }
  catch (e) { return { caught: true, tail: (e.stdout + e.stderr).split("\n").filter((l) => /FAIL|×|Error/.test(l)).slice(0, 4).join(" | ").slice(0, 300) }; }
}
async function tsc(dir) {
  writeFileSync(join(dir, "tsconfig.bench.json"), TSCONFIG);
  try { await run(process.execPath, [join(REPO, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.bench.json"], { cwd: dir, maxBuffer: 32 << 20 }); return { caught: false }; }
  catch (e) { return { caught: true, tail: (e.stdout || e.stderr).split("\n").slice(0, 2).join(" | ").slice(0, 300) }; }
}

function pactNodeModules() {
  const ptr = join(WORK, "lanes-bench-pact-install-dir");
  if (existsSync(ptr)) { const d = readFileSync(ptr, "utf8").trim(); if (existsSync(join(d, "node_modules/@pact-foundation/pact"))) return join(d, "node_modules"); }
  const d = tmp("pact-deps");
  writeFileSync(join(d, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const r = sh("npm", ["install", "--no-audit", "--no-fund", "-D", "@pact-foundation/pact@^17", "vitest@^5.1.0"], d, { timeout: 900_000 });
  if (r.code) throw new Error("pact install failed: " + r.stderr.slice(-800));
  writeFileSync(ptr, d + "\n");
  return join(d, "node_modules");
}
let PACT_NM;
export function pactDir(edit) {
  PACT_NM ??= pactNodeModules();
  const d = tmp("pact");
  for (const p of ["apps", "contracts", "fixtures"]) cpSync(join(REPO, "examples/three-lanes", p), join(d, p), { recursive: true });
  edit?.(d);
  mkdirSync(join(d, "pact"));
  for (const f of ["world-brain.consumer.pact.test.ts", "brain.provider.pact.test.ts"]) cpSync(join(BENCH, "alternatives/pact", f), join(d, "pact", f));
  cpSync(join(BENCH, "alternatives/pact/vitest.pact.config.ts"), join(d, "vitest.pact.config.ts"));
  writeFileSync(join(d, "package.json"), JSON.stringify({ private: true, type: "module" }));
  symlinkSync(PACT_NM, join(d, "node_modules"), "dir");
  return d;
}
export async function pact(dir) {
  const vitest = join(dir, "node_modules/vitest/vitest.mjs");
  const out = {};
  for (const [step, file] of [["consumer", "pact/world-brain.consumer.pact.test.ts"], ["provider", "pact/brain.provider.pact.test.ts"]]) {
    const t0 = performance.now();
    try { await run(process.execPath, [vitest, "run", "-c", "vitest.pact.config.ts", file], { cwd: dir, maxBuffer: 32 << 20 }); out[step] = { ok: true }; }
    catch (e) { out[step] = { ok: false, output: (e.stdout ?? "") + (e.stderr ?? "") }; }
    out[step].ms = round(performance.now() - t0);
    if (!out[step].ok) break; // provider can't verify a pact the consumer never wrote
  }
  const caught = !out.consumer.ok || !out.provider?.ok;
  return { caught, stage: !out.consumer.ok ? "consumer" : !out.provider?.ok ? "provider" : null, consumer_ms: out.consumer.ms, provider_ms: out.provider?.ms, output: caught ? (out.provider?.output ?? out.consumer.output) : undefined };
}

/** Run fn over items with n workers; fn gets the worker index so each worker can own a separate repo copy. */
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async (_, w) => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], w); } }));
  return out;
}

async function study(m) {
  // One repo copy per worker: concurrent `lanes check` runs in one checkout race on git's index and .lanes/cache.
  const dirs = Array.from({ length: POOL }, () => exampleRepo(`mut-${m.id.replace(/\W+/g, "-")}`, (d) => { fixed(d); m.edit?.(d); }));
  const dir = dirs[0];
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  const lanes = await pool(seeds, POOL, (s, w) => lanesCheck(dirs[w], s, false));
  const lanesFast = await pool(seeds, POOL, (s, w) => lanesCheck(dirs[w], s, true));
  const [examples, types, p] = await Promise.all([examplesOnly(dir), tsc(dir), pact(pactDir((d) => { fixed(d); m.edit?.(d); }))]);
  const rate = (rs) => rs.filter((r) => r.caught).length / rs.length;
  const row = {
    id: m.id, cat: m.cat, desc: m.desc, trigger: m.trigger,
    lanes: { rate: rate(lanes), kinds: [...new Set(lanes.flatMap((r) => r.kinds))], first: lanes.find((r) => r.caught)?.first, shrunk: lanes.find((r) => r.caught)?.shrunk, runs: lanes.map(({ seed, caught, ms }) => ({ seed, caught, ms })), errors: lanes.filter((r) => r.error).map((r) => r.error), config_failures: [...new Set(lanes.flatMap((r) => r.config))] },
    lanesFast: { rate: rate(lanesFast), runs: lanesFast.map(({ seed, caught, ms }) => ({ seed, caught, ms })) },
    pact: { caught: p.caught, stage: p.stage, consumer_ms: p.consumer_ms, provider_ms: p.provider_ms },
    examples: { caught: examples.caught, tail: examples.tail },
    tsc: { caught: types.caught, tail: types.tail },
  };
  console.log(`${m.id.padEnd(18)} lanes ${(row.lanes.rate * 100).toFixed(0).padStart(3)}%  fast ${(row.lanesFast.rate * 100).toFixed(0).padStart(3)}%  pact ${p.caught ? "✓" : "·"}  examples ${examples.caught ? "✓" : "·"}  tsc ${types.caught ? "✓" : "·"}  ${row.lanes.kinds.join(",")}`);
  return row;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Baseline must be green everywhere (no false positives), else the study is meaningless.
  const base = await study({ id: "baseline (fixed)", cat: "none", desc: "planted bug fixed, no mutation", trigger: "-", edit: null });
  const fp = base.lanes.rate > 0 || base.lanesFast.rate > 0 || base.pact.caught || base.examples.caught || base.tsc.caught;
  if (fp) console.error("WARNING: baseline not green for some approach", JSON.stringify(base, null, 1));
  const rows = [];
  for (const m of MUTANTS.filter((m) => !ONLY || ONLY.includes(m.id))) rows.push(await study(m));
  const approaches = ["lanes", "lanesFast", "pact", "examples", "tsc"];
  const caughtBy = (r, a) => (a.startsWith("lanes") ? r[a].rate > 0 : r[a].caught);
  const totals = Object.fromEntries(approaches.map((a) => [a, {
    caught_any_seed: rows.filter((r) => caughtBy(r, a)).length,
    ...(a.startsWith("lanes") ? {
      caught_every_seed: rows.filter((r) => r[a].rate === 1).length,
      per_seed_catch_counts: Array.from({ length: SEEDS }, (_, i) => rows.filter((r) => r[a].runs[i].caught).length),
    } : {}),
  }]));
  const union = rows.filter((r) => caughtBy(r, "pact") || caughtBy(r, "examples") || caughtBy(r, "tsc")).length;
  saveResult("mutants", {
    method: `${MUTANTS.length} single-bug mutants of examples/three-lanes (planted bug fixed as baseline); lanes runs seeds 1..${SEEDS}; "caught" = the approach exits non-zero.`,
    seeds: SEEDS, n: rows.length, baseline: base, baseline_false_positive: fp, totals, union_pact_examples_tsc: union, rows,
  });
}
