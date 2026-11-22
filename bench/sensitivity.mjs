// Detection rate of the rare-input mutants vs property_runs (how many generated inputs Lanes tries per handler).
// crowded-hold needs 11-12 agents in one TickRequest; haunt-rare needs a curious agent + a haunt with intensity > 9.
import { join } from "node:path";
import { LANES_BIN, exampleRepo, replaceIn, round, saveResult } from "./lib.mjs";
import { MUTANTS } from "./mutants.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SEEDS = Number(process.env.SEEDS ?? 10);
const RUNS = [50, 200, 1000, 5000];
const out = [];
for (const id of ["crowded-hold", "haunt-rare", "to-no-clamp-high"]) {
  const m = MUTANTS.find((x) => x.id === id);
  for (const n of RUNS) {
    const dirs = Array.from({ length: 4 }, () => exampleRepo(`sens-${id}-${n}`, (d) => {
      replaceIn(join(d, "apps/brain/src/tick.ts"), "holdMs: 1800 };", "holdMs: 1200 };");
      replaceIn(join(d, "lanes.yaml"), "property_runs: 200", `property_runs: ${n}`);
      m.edit(d);
    }));
    const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
    const res = [];
    for (let i = 0; i < seeds.length; i += 4) {
      res.push(...(await Promise.all(seeds.slice(i, i + 4).map(async (s, w) => {
        try { await run(process.execPath, [LANES_BIN, "check", "--json", "--lane", "brain", "--seed", String(s)], { cwd: dirs[w], maxBuffer: 32 << 20 }); return false; }
        catch (e) { try { return JSON.parse(e.stdout).failures.some((f) => f.check === "handler-property"); } catch { return false; } }
      }))));
    }
    const rate = res.filter(Boolean).length / res.length;
    out.push({ mutant: id, property_runs: n, rate });
    console.log(id.padEnd(18), String(n).padStart(5), `${round(rate * 100, 0)}%`);
  }
}
saveResult("sensitivity", { method: `lanes check --lane brain over seeds 1..${SEEDS}, property_runs set in lanes.yaml`, seeds: SEEDS, rows: out });
