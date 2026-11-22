// Benchmark 3: speed. Run on an otherwise idle machine (not alongside mutants.mjs).
//   guard hook latency (allow + block), `lanes check` full / --fast / --lane brain, check time vs property_runs,
//   time-to-first-failure for the planted bug, and a minimal Pact consumer+provider run for comparison.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { exampleRepo, lanes, replaceIn, round, saveResult, summary } from "./lib.mjs";
import { pact, pactDir } from "./mutants.mjs";

const GUARD_RUNS = Number(process.env.GUARD_RUNS ?? 50);
const CHECK_RUNS = Number(process.env.CHECK_RUNS ?? 7);
const env = { LANES_CLI: "npx lanes" };
const S = (xs) => Object.fromEntries(Object.entries(summary(xs)).map(([k, v]) => [k, round(v, 1)]));

const ex = exampleRepo("speed");
lanes(ex, ["join", "brain"], { env });
const guard = (file) => JSON.stringify({ cwd: ex, hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: join(ex, file) } });
const bashGuard = JSON.stringify({ cwd: ex, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "sed -i s/a/b/ apps/world/src/apply.ts" } });
const time = (args, input) => { const r = lanes(ex, args, { env, input }); return { ms: r.ms, code: r.code }; };

// Warm up the OS file cache once.
time(["hook", "guard"], guard("apps/brain/src/tick.ts"));
const node = [];
for (let i = 0; i < GUARD_RUNS; i++) { const t = performance.now(); lanes(ex, ["--version"], { env }); node.push(performance.now() - t); }
const allow = [], block = [], bash = [];
for (let i = 0; i < GUARD_RUNS; i++) {
  const a = time(["hook", "guard"], guard("apps/brain/src/tick.ts")); if (a.code !== 0) throw new Error("allow expected");
  const b = time(["hook", "guard"], guard("apps/world/src/apply.ts")); if (b.code !== 2) throw new Error("block expected");
  const c = time(["hook", "guard"], bashGuard);
  allow.push(a.ms); block.push(b.ms); bash.push(c.ms);
}
const sessionStart = [];
for (let i = 0; i < 20; i++) sessionStart.push(time(["hook", "session-start"], JSON.stringify({ cwd: ex, hook_event_name: "SessionStart", source: "startup" })).ms);

// lanes check variants on the example (planted bug present → exit 1 is expected).
const checks = {};
for (const [name, args] of [["full", ["check", "--seed", "1"]], ["--fast", ["check", "--fast", "--seed", "1"]], ["--lane brain", ["check", "--lane", "brain", "--seed", "1"]], ["--fast --lane brain", ["check", "--fast", "--lane", "brain", "--seed", "1"]]]) {
  time(args); // warm
  const xs = []; for (let i = 0; i < CHECK_RUNS; i++) xs.push(time(args).ms);
  checks[name] = S(xs);
}

// check time vs property_runs (bug fixed so every run goes the full distance; then with the bug for shrink time).
const runsCurve = [];
for (const fixedBug of [true, false]) {
  for (const n of [50, 200, 1000, 5000]) {
    const d = exampleRepo(`speed-runs-${n}`, (dir) => {
      replaceIn(join(dir, "lanes.yaml"), "property_runs: 200", `property_runs: ${n}`);
      if (fixedBug) replaceIn(join(dir, "apps/brain/src/tick.ts"), "holdMs: 1800 };", "holdMs: 1200 };");
    });
    lanes(d, ["check", "--seed", "1"], { env });
    const xs = []; let report;
    for (let i = 0; i < CHECK_RUNS; i++) { const r = lanes(d, ["check", "--json", "--seed", String(i + 1)], { env }); xs.push(r.ms); report = JSON.parse(r.stdout); }
    runsCurve.push({ property_runs: n, bug: !fixedBug, ...S(xs), internal_duration_ms: report.durationMs, exit_failures: report.failures.length });
  }
}

// Time to first failure for the planted bug, from the JSON report's own durationMs, over seeds.
const ttff = [];
for (let s = 1; s <= 20; s++) { const r = lanes(ex, ["check", "--json", "--lane", "brain", "--seed", String(s)], { env }); const rep = JSON.parse(r.stdout); ttff.push({ seed: s, wall_ms: round(r.ms), report_ms: rep.durationMs, caught: rep.failures.some((f) => f.check === "handler-property"), shrinks: Number(/after (\d+) shrinks/.exec(rep.failures.find((f) => f.check === "handler-property")?.detail ?? "")?.[1] ?? NaN) }); }

// Pact: consumer test + provider verification on the same example (fixed bug, so it runs to completion).
const pactRuns = [];
for (let i = 0; i < CHECK_RUNS; i++) {
  const d = pactDir((dir) => replaceIn(join(dir, "apps/brain/src/tick.ts"), "holdMs: 1800 };", "holdMs: 1200 };"));
  const r = await pact(d);
  pactRuns.push({ consumer_ms: r.consumer_ms, provider_ms: r.provider_ms, total_ms: round(r.consumer_ms + r.provider_ms) });
}

saveResult("speed", {
  method: `wall-clock ms via spawnSync from Node (includes process start); guard: ${GUARD_RUNS} runs each; checks: ${CHECK_RUNS} runs after 1 warm-up`,
  node_startup: S(node),
  guard: { allow_own_lane: S(allow), block_other_lane: S(block), bash_command: S(bash), session_start: S(sessionStart) },
  checks, property_runs_curve: runsCurve,
  time_to_first_failure: { runs: ttff, wall: S(ttff.map((x) => x.wall_ms)), shrinks: S(ttff.map((x) => x.shrinks).filter((x) => !Number.isNaN(x))), caught: ttff.filter((x) => x.caught).length },
  pact: { runs: pactRuns, total: S(pactRuns.map((x) => x.total_ms)), consumer: S(pactRuns.map((x) => x.consumer_ms)), provider: S(pactRuns.map((x) => x.provider_ms)) },
});
console.log("guard allow", S(allow), "block", S(block));
console.log("checks", checks);
console.log("pact", S(pactRuns.map((x) => x.total_ms)));
