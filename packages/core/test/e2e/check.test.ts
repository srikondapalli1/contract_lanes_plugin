// BUILD.md e2e #1–#4: green first run, the planted bug, lock behaviour.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schema as CheckReport } from "../../src/contracts/CheckReport.ts";
import { schema as GraphData } from "../../src/contracts/GraphData.ts";
import { schema as LockFile } from "../../src/contracts/LockFile.ts";
import { REPO, exampleRepo, git, lanes, linkDeps, setHold, sh, tmp } from "../helpers.ts";

describe("lanes init → check (green first run)", () => {
  it("empty directory is green on the first check", () => {
    const dir = tmp("init");
    const init = lanes(dir, ["init", "--yes", "--owner", "dev"]);
    expect(init.code, init.stderr).toBe(0);
    for (const f of ["lanes.yaml", "contracts/Example.ts", "fixtures/Example/valid/basic.json", "fixtures/Example/invalid/missing-id.json", "src/__contracts__/Example.test.ts", ".github/workflows/lanes.yml", ".github/CODEOWNERS", "AGENTS.md", "package.json"]) expect(existsSync(join(dir, f)), f).toBe(true);
    expect(readFileSync(join(dir, ".git/hooks/pre-commit"), "utf8")).toContain("guard --staged");
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".lanes/");
    linkDeps(dir);
    const r = lanes(dir, ["check", "--json"]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const report = CheckReport.parse(JSON.parse(r.stdout));
    expect(report.summary).toEqual({ pass: 1, fail: 0, pending: 0, untested: 0 });
    expect(lanes(dir, ["join", "app"]).code).toBe(0);
    expect(lanes(dir, ["lock"]).code).toBe(0);
    LockFile.parse(JSON.parse(readFileSync(join(dir, "contracts.lock"), "utf8")));
    expect(lanes(dir, ["doctor"]).stdout).toContain("bound to lane \"app\"");
    // the generated project typechecks under strict TS, including contract-lanes/test types
    const tsc = sh(process.execPath, [join(REPO, "node_modules/typescript/bin/tsc"), "-p", dir], dir);
    expect(tsc.code, tsc.stdout).toBe(0);
  });

  it("the three-lanes example typechecks under strict TS", () => {
    const dir = exampleRepo("tsc");
    const tsc = sh(process.execPath, [join(REPO, "node_modules/typescript/bin/tsc"), "-p", dir], dir);
    expect(tsc.code, tsc.stdout).toBe(0);
  });

  it("refuses to init twice and reports config errors with exit 2", () => {
    const dir = tmp("cfg");
    lanes(dir, ["init", "--yes", "--owner", "dev"]);
    expect(lanes(dir, ["init", "--yes"]).code).toBe(2);
    writeFileSync(join(dir, "lanes.yaml"), readFileSync(join(dir, "lanes.yaml"), "utf8").replace("consumers\": [\"app\"]", "consumers\": [\"ghost\"]"));
    linkDeps(dir);
    const r = lanes(dir, ["check"]);
    expect(r.code).toBe(2);
    expect(r.stdout).toContain('references unknown lane "ghost"');
  });
});

describe("the planted bug", () => {
  const dir = exampleRepo("bug");
  it("exits 1 with seed, shrunk counterexample and repro; the graph edge is red", () => {
    const r = lanes(dir, ["check", "--json", "--seed", "1234"]);
    expect(r.code).toBe(1);
    const report = CheckReport.parse(JSON.parse(r.stdout));
    const f = report.failures.find((x) => x.check === "handler-property")!;
    expect(f).toMatchObject({ contract: "TickResponse", owner: "brain", seed: 1234 });
    expect(f.message).toMatch(/holdMs: Too big: expected number to be <=1500/);
    expect(f.counterexample).toMatchObject({ agents: [{ mood: "spooked" }] });
    expect((f.counterexample as any).agents).toHaveLength(1);
    expect(f.repro).toMatch(/check --lane brain --seed 1234$/);
    const g = GraphData.parse(JSON.parse(readFileSync(join(dir, ".lanes/cache/graph.json"), "utf8")));
    expect(g.edges.find((e) => e.contract === "TickResponse")).toMatchObject({ status: "fail", topFailure: { owner: "brain", seed: 1234 } });
    expect(g.edges.filter((e) => e.status === "pass")).toHaveLength(3);
    // the printed repro reproduces the same counterexample
    const again = CheckReport.parse(JSON.parse(lanes(dir, ["check", "--lane", "brain", "--seed", "1234", "--json"]).stdout));
    expect(again.failures.find((x) => x.check === "handler-property")!.counterexample).toEqual(f.counterexample);
  });
  it("human output names the owner and how to reproduce", () => {
    const r = lanes(dir, ["check", "--fast", "--seed", "9"]);
    expect(r.stdout).toMatch(/❌ fail\s+TickResponse\s+brain → world/);
    expect(r.stdout).toMatch(/seed: 9/);
    expect(r.stdout).toMatch(/counterexample: \{/);
    expect(r.stdout).toMatch(/❌ 1 fail/);
  });
});

describe("lock", () => {
  it("fixture change on main fails; on contract/Haunt-rename it is classified major", () => {
    const dir = exampleRepo("lock", { fixBug: true });
    expect(lanes(dir, ["lock"]).code).toBe(0);
    git(dir, "add", "-A"); git(dir, "commit", "-qm", "lock");
    const fx = join(dir, "fixtures/Haunt/valid/whisper.json");
    writeFileSync(fx, readFileSync(fx, "utf8").replace('"expiresAtTick": 50', '"expiresAtTick": 51'));
    const onMain = CheckReport.parse(JSON.parse(lanes(dir, ["check", "--json"]).stdout));
    expect(onMain.lock.ok).toBe(false);
    expect(onMain.failures.find((f) => f.check === "lock")?.message).toMatch(/Haunt changed since contracts.lock \(fixtures\)/);
    git(dir, "switch", "-q", "-c", "contract/Haunt-rename");
    const r = CheckReport.parse(JSON.parse(lanes(dir, ["check", "--json"]).stdout));
    expect(r.lock).toMatchObject({ ok: true, changed: ["Haunt"], classification: "major" });
    expect(r.lock.reasons).toContain("Haunt: fixture edited: fixtures/Haunt/valid/whisper.json");
  });
  it("adding an optional property is minor; enum value added warns", () => {
    const dir = exampleRepo("minor", { fixBug: true });
    expect(lanes(dir, ["lock"]).code).toBe(0);
    git(dir, "add", "-A"); git(dir, "commit", "-qm", "lock"); git(dir, "switch", "-q", "-c", "contract/Haunt-note");
    const c = join(dir, "contracts/Haunt.ts");
    writeFileSync(c, readFileSync(c, "utf8").replace('expiresAtTick: z.int().min(0),', 'expiresAtTick: z.int().min(0),\n  note: z.string().max(40).optional(),').replace('"poltergeist"]', '"poltergeist", "banshee"]'));
    const r = CheckReport.parse(JSON.parse(lanes(dir, ["check", "--json"]).stdout));
    expect(r.lock.classification).toBe("minor");
    expect(r.lock.reasons).toEqual(expect.arrayContaining(["Haunt.note: optional property added", expect.stringMatching(/Haunt.kind: enum value added \(banshee\); warning: exhaustive consumers may break/)]));
  });
  it("lock refuses while red", () => {
    const dir = exampleRepo("lockred");
    const r = lanes(dir, ["lock"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/lanes lock refuses: 1 failure/);
    setHold(dir, 1000);
  });
});
