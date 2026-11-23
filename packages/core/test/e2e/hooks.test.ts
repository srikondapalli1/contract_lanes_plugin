// C10: the plugin's hook entrypoint, tested against the HookIO fixtures without starting Claude Code.
import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { schema as HookIO } from "../../src/contracts/HookIO.ts";
import { exampleRepo, git, lanes, setHold, tmp } from "../helpers.ts";

const DIR = join(import.meta.dirname, "../../fixtures/HookIO/valid");
const cases = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => [f, HookIO.parse(JSON.parse(readFileSync(join(DIR, f), "utf8")))] as const);
let base: { open: string; locked: string };

beforeAll(() => {
  const open = exampleRepo("hooks-open", { fixBug: true });
  const locked = exampleRepo("hooks-locked", { fixBug: true });
  expect(lanes(locked, ["lock"]).code).toBe(0);
  git(locked, "add", "-A"); git(locked, "commit", "-qm", "lock");
  base = { open, locked };
});

function sandbox(setup: NonNullable<ReturnType<typeof HookIO.parse>["setup"]> = {}) {
  const dir = tmp("hook");
  cpSync(setup.locked ? base.locked : base.open, dir, { recursive: true, filter: (s) => !s.includes(`${"/"}.lanes`) });
  if (setup.branch) git(dir, "switch", "-q", "-c", setup.branch);
  if (setup.lane) expect(lanes(dir, ["join", setup.lane]).code).toBe(0);
  if (setup.override) lanes(dir, ["override", ...setup.override, "--reason", "fixture"]);
  if (setup.planted_bug) setHold(dir, 1800);
  if (setup.stop_gate) writeFileSync(join(dir, "lanes.yaml"), readFileSync(join(dir, "lanes.yaml"), "utf8").replace("stop_gate: false", "stop_gate: true"));
  return dir;
}

describe("hook fixtures (C10)", () => {
  it.each(cases)("%s", (_name, c) => {
    const root = sandbox(c.setup);
    const stdin = JSON.parse(JSON.stringify(c.stdin).replaceAll("${ROOT}", root));
    const r = lanes(root, ["hook", c.event], {}, JSON.stringify(stdin));
    expect(r.code, r.stderr).toBe(c.expect.exit);
    if (c.expect.stdout !== undefined) expect(r.stdout.trim()).toBe(c.expect.stdout);
    for (const s of c.expect.stdoutIncludes ?? []) expect(r.stdout).toContain(s);
    for (const s of c.expect.stderrIncludes ?? []) expect(r.stderr).toContain(s);
    if (c.expect.stderrEmpty) expect(r.stderr).toBe("");
    if (c.expect.maxMs) expect(r.ms).toBeLessThan(c.expect.maxMs);
  });

  it("guard blocks a cross-lane edit within the 100 ms budget", () => {
    const root = sandbox({ lane: "brain" });
    const input = JSON.stringify({ cwd: root, tool_name: "Edit", tool_input: { file_path: join(root, "apps/world/x.ts") } });
    lanes(root, ["hook", "guard"], {}, input); // warm the ownership cache
    const ms = Array.from({ length: 9 }, () => { const r = lanes(root, ["hook", "guard"], {}, input); expect(r.code).toBe(2); return r.ms; }).sort((a, b) => a - b);
    // The fastest run is the guard's own cost (process start included). The median also absorbs
    // contention from the other test files running in parallel, so shared CI runners get a looser cap.
    expect(ms[0]).toBeLessThan(100);
    expect(ms[4]).toBeLessThan(process.env.CI ? 250 : 100);
  });

  it("git pre-commit backstop blocks the same edit made by any tool", () => {
    const root = sandbox({ lane: "brain" });
    writeFileSync(join(root, "apps/world/src/apply.ts"), "// edited with sed\n");
    git(root, "add", "-A");
    const r = lanes(root, ["guard", "--staged"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('belongs to lane "world"; you are in "brain"');
    const commit = (() => { try { git(root, "commit", "-qm", "sneaky"); return 0; } catch { return 1; } })();
    expect(commit).toBe(1);
  });

  it("override is logged as a commit trailer", () => {
    const root = sandbox({ lane: "brain" });
    lanes(root, ["override", "apps/world/src/apply.ts", "--reason", "pairing with world"]);
    writeFileSync(join(root, "apps/world/src/apply.ts"), "// pairing\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "pair edit");
    expect(git(root, "log", "-1", "--format=%B")).toContain("Lanes-Override: apps/world/src/apply.ts | pairing with world");
  });
});
