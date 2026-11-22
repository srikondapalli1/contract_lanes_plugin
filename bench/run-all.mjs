// Run every benchmark in order, then render charts. Timing-sensitive steps run alone.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
for (const s of ["mutants.mjs", "tokens.mjs", "guard-scenarios.mjs", "setup-size.mjs", "speed.mjs", "sensitivity.mjs", "install.mjs", "charts.mjs"]) {
  console.log(`\n=== ${s}`);
  const r = spawnSync(process.execPath, [join(here, s)], { stdio: "inherit", cwd: here });
  if (r.status) { console.error(`${s} exited ${r.status}`); process.exit(r.status); }
}
