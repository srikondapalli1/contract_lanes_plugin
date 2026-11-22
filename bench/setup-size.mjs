// Benchmark 5: what an agent must author for the world ⇄ brain tick edge (TickRequest + TickResponse), per approach.
// Counts non-blank lines and approximate tokens of the files themselves (no model involved).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BENCH, EXAMPLE, measure, saveResult } from "./lib.mjs";

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const count = (paths) => {
  const text = paths.map((p) => readFileSync(p, "utf8")).join("\n");
  return { files: paths.length, lines: text.split("\n").filter((l) => l.trim()).length, tokens: measure(text).tokens, list: paths.map((p) => relative(BENCH + "/..", p)) };
};
const ex = (...p) => join(EXAMPLE, ...p);
const schemas = [ex("contracts/TickRequest.ts"), ex("contracts/TickResponse.ts"), ex("contracts/_common.ts")];
const fixtures = [...files(ex("fixtures/TickRequest")), ...files(ex("fixtures/TickResponse"))];
const consumerTests = [ex("apps/brain/src/__contracts__/TickRequest.test.ts"), ex("apps/world/src/__contracts__/TickResponse.test.ts")];
const alt = (...p) => join(BENCH, "alternatives", ...p);
const rows = {
  lanes: { ...count([...schemas, ...fixtures, ...consumerTests, ex("lanes.yaml")]), note: "zod schemas + fixtures + consumer tests + lanes.yaml (lane map, contract map, handler binding for all 3 contracts); property tests, mutation checks and the guard come from the tool" },
  zod_vitest: { ...count([...schemas, ...fixtures, ...consumerTests, alt("zod-vitest/tick.zod.test.ts"), alt("prompt-only/CLAUDE.md")]), note: "same schemas/fixtures/tests + a hand-written handler test + CLAUDE.md ownership rules (unenforced)" },
  pact: { ...count([alt("pact/world-brain.consumer.pact.test.ts"), alt("pact/brain.provider.pact.test.ts"), alt("prompt-only/CLAUDE.md")]), note: "consumer test + HTTP provider verification + CLAUDE.md ownership rules (unenforced); no schemas (Pact matchers are per-example). Haunt would need a separate message pact (not written)." },
  prompt_only: { ...count([alt("prompt-only/CLAUDE.md")]), note: "rules only; nothing is checked" },
};
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(12), v.files, "files", v.lines, "lines", v.tokens, "tokens");
saveResult("setup_size", { edge: "world ⇄ brain (TickRequest, TickResponse)", rows });
