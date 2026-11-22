import fc from "fast-check";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { globToRegex, matches, expandBraces, staticPrefix } from "../src/util/glob.ts";
import { satisfies } from "../src/util/semver.ts";
import { parseArgs } from "../src/util/args.ts";
import { arbitraryFor, applyMutation, mutationsOf } from "../src/generate/index.ts";
import { compareLock, entryFor } from "../src/lock/index.ts";
import { decideBash, decideEdit } from "../src/guard/index.ts";
import { metaBlock, parseMeta, withMeta } from "../src/github/index.ts";
import { renderPrComment } from "../src/status/prComment.ts";
import { threeNumbers } from "../src/status/index.ts";
import { planningWarnings } from "../src/config/index.ts";
import { schema as LanesConfig } from "../src/contracts/LanesConfig.ts";
import { schema as GraphData } from "../src/contracts/GraphData.ts";
import { graphFromReport } from "../src/graph-data/index.ts";
import { linkedIssues } from "../src/queue/index.ts";

describe("glob", () => {
  it.each([
    ["apps/world/**", "apps/world/src/x.ts", true], ["apps/world/**", "apps/worldx/a.ts", false],
    ["**/__contracts__/A.test.*", "apps/b/src/__contracts__/A.test.ts", true], ["src/*.ts", "src/a/b.ts", false],
    ["packages/core/src/{github,queue}/**", "packages/core/src/queue/index.ts", true], ["fixtures/Haunt/**", "fixtures/Haunt/valid/a.json", true],
    ["a/?.ts", "a/b.ts", true], ["a/[!x].ts", "a/x.ts", false],
  ])("%s ~ %s = %s", (g, f, ok) => expect(globToRegex(g).test(f)).toBe(ok));
  it("prefixes and braces", () => {
    expect(staticPrefix("apps/world/**")).toBe("apps/world/");
    expect(expandBraces("a/{b,c}/**")).toEqual(["a/b/**", "a/c/**"]);
    expect(matches("x/y", ["z/**", "x/*"])).toBe(true);
  });
});

describe("semver", () => {
  it.each([["0.1.0", "^0.1.0", true], ["0.2.0", "^0.1.0", false], ["1.4.2", "^1.2.0", true], ["2.0.0", "^1.2.0", false], ["1.2.9", "~1.2.0", true], ["1.3.0", "~1.2.0", false], ["3.0.0", ">=2.1.0", true], ["1.0.0", "1.x", true], ["0.1.0", "*", true]])("%s satisfies %s = %s", (v, r, ok) => expect(satisfies(v, r)).toBe(ok));
});

describe("args", () => {
  it("parses flags, booleans and positionals", () => {
    expect(parseArgs(["check", "--lane", "brain", "--fast", "--seed=7", "x"])).toEqual({ _: ["check", "x"], lane: "brain", fast: true, seed: "7" });
    expect(parseArgs(["msg", "world", "--type", "request", "need", "fixtures"])._).toEqual(["msg", "world", "need", "fixtures"]);
  });
});

describe("generator", () => {
  const schemas = {
    obj: z.object({ a: z.string().min(2).max(5), b: z.int().min(-3).max(1500), c: z.boolean(), d: z.enum(["x", "y"]), e: z.literal("k"), f: z.array(z.number().gt(0).lt(1)).min(1).max(3), g: z.string().optional(), h: z.string().nullable(), i: z.union([z.literal(1), z.object({ q: z.string() })]), j: z.record(z.string(), z.int()) }),
    regex: z.object({ id: z.string().regex(/^h-[a-z0-9]{2,8}$/), mail: z.email(), uid: z.uuid() }),
    nested: z.object({ list: z.array(z.object({ p: z.object({ x: z.int().min(0).max(63) }) })).max(4), dflt: z.int().default(3) }),
    mult: z.object({ m: z.int().multipleOf(5).min(0).max(100), big: z.int() }),
  };
  it.each(Object.entries(schemas))("every generated %s value parses", (_n, s) => {
    const ctx = { warnings: [] as string[] };
    const arb = arbitraryFor(s, "", ctx)!;
    expect(arb).toBeTruthy();
    fc.assert(fc.property(arb, (v) => s.safeParse(v).success), { numRuns: 300 });
  });
  it("skips unsupported types with a warning naming the field", () => {
    const ctx = { warnings: [] as string[] };
    expect(arbitraryFor(z.object({ ok: z.string(), bad: z.string().transform((x) => x.length).pipe(z.number()).optional(), lz: z.lazy(() => z.string()).optional() }), "", ctx)).toBeTruthy();
    expect(ctx.warnings.join("\n")).toMatch(/lz: unsupported zod type "lazy"/);
    const ctx2 = { warnings: [] as string[] };
    expect(arbitraryFor(z.object({ fn: z.lazy(() => z.string()) }), "", ctx2)).toBeNull();
  });
  it("mutations of a valid value all fail, and cover drop/type/range", () => {
    const s = schemas.nested.extend({ name: z.string().max(3), kind: z.enum(["a", "b"]) });
    const v = { list: [{ p: { x: 5 } }], name: "abc", kind: "a" };
    const ms = mutationsOf(s, v);
    expect(new Set(ms.map((m) => m.kind))).toEqual(new Set(["drop", "type", "range"]));
    for (const m of ms) expect(s.safeParse(applyMutation(v, m)).success, JSON.stringify(m)).toBe(false);
    expect(ms.some((m) => m.path.join(".") === "dflt")).toBe(false);
  });
});

describe("lock classification", () => {
  const cfg = LanesConfig.parse({ lanes_version: "^0.1.0", approvers: [], lanes: { a: { owner: "@a", paths: ["a/**"] }, b: { owner: "@b", paths: ["b/**"] } }, contracts: { C: { producer: "a", consumers: ["b"] } } });
  const js = (o: z.ZodType) => z.toJSONSchema(o, { io: "input" });
  const entry = (s: z.ZodType) => ({ version: "1.0.0", schemaHash: JSON.stringify(js(s)).length.toString(16).padStart(64, "0"), fixturesHash: "0".repeat(64), consumerTestsHash: {}, jsonSchema: js(s), fixtureFiles: {} });
  const lock = (s: z.ZodType) => ({ v: 1 as const, lockedAt: 1, lanes_version: "^0.1.0", contracts: { C: entry(s) } });
  const base = z.object({ a: z.string(), k: z.enum(["x", "y"]) });
  const cmp = (next: z.ZodType, branch = "contract/C-x") => compareLock("/", cfg, lock(base), new Map([["C", { ...entry(next), schemaHash: "f".repeat(64) }]]), branch, "lanes");
  it("optional property → minor", () => expect(cmp(base.extend({ n: z.number().optional() }))).toMatchObject({ ok: true, classification: "minor" }));
  it("enum value added → minor with warning", () => expect(cmp(base.extend({ k: z.enum(["x", "y", "z"]) })).reasons?.[0]).toMatch(/enum value added \(z\); warning/));
  it("required property / removal / type change → major", () => {
    expect(cmp(base.extend({ n: z.number() })).classification).toBe("major");
    expect(cmp(z.object({ k: z.enum(["x", "y"]) })).classification).toBe("major");
    expect(cmp(base.extend({ a: z.number() })).classification).toBe("major");
  });
  it("off a contract branch any change is a lock failure owned by the producer", () => {
    const r = cmp(base.extend({ n: z.number().optional() }), "main");
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatchObject({ check: "lock", contract: "C", owner: "a" });
  });
  it("no lock file = setup phase", () => expect(compareLock("/", cfg, undefined, new Map(), "main", "lanes")).toMatchObject({ ok: true, setup: true }));
  it("entryFor is deterministic", () => expect(entryFor(process.cwd(), { name: "C", version: "1", jsonSchema: { b: 1, a: 2 }, fixtures: [], tests: {} }).schemaHash).toBe(entryFor(process.cwd(), { name: "C", version: "1", jsonSchema: { a: 2, b: 1 }, fixtures: [], tests: {} }).schemaHash));
});

describe("guard decisions", () => {
  const map = { lockPresent: true, configMtime: 0, lockMtime: 0, lanes: { world: { owner: "@w", globs: ["apps/world/**"] }, brain: { owner: "@b", globs: ["apps/brain/**", "contracts/TickResponse.ts"] } }, locked: ["contracts.lock", "contracts/TickResponse.ts"] };
  const b = { v: 1 as const, lane: "brain", boundAt: 1 };
  it("blocks cross-lane and locked edits with the teaching message", () => {
    const d = decideEdit("/r", map, b, "main", [], "/r/apps/world/a.ts");
    expect(d.allow).toBe(false);
    expect((d as any).message).toMatch(/^Blocked: apps\/world\/a.ts belongs to lane "world"; you are in "brain". Ask instead: .* msg world --type request "<what you need>". Override \(logged\): .* override apps\/world\/a.ts --reason "<why>".$/);
    expect(decideEdit("/r", map, b, "main", [], "contracts/TickResponse.ts").allow).toBe(false);
    expect(decideEdit("/r", map, b, "contract/TickResponse-x", [], "contracts/TickResponse.ts").allow).toBe(true);
    expect(decideEdit("/r", map, b, "main", [{ path: "apps/world/**", reason: "r", at: 0, until: Date.now() + 1e6 }], "apps/world/a.ts").allow).toBe(true);
  });
  it.each([
    ["git push origin main", "feature", false], ["git push", "main", false], ["git push -u origin HEAD", "feature", true], ["git push origin +fix/1", "fix/1", false],
    ["git -C /x push --force origin a", "a", false], ["git push -uf origin a", "a", false], ["echo git push origin main", "a", false], ["git status && git push origin feat:main", "feat", false],
    ["npm test", "main", true], ["git pushx", "main", true],
  ])("bash `%s` on %s → allow=%s", (cmd, br, ok) => expect(decideBash("/r", map, br, [], cmd).allow).toBe(ok));
  it("setup phase allows pushing main", () => expect(decideBash("/r", { ...map, lockPresent: false }, "main", [], "git push origin main").allow).toBe(true));
});

describe("issue meta + PR comment", () => {
  it("machine block survives arrows and replaces in place", () => {
    const m = { v: 1 as const, type: "request" as const, to: "world", from: "brain", key: "k", contract: "Haunt" };
    const body = `${metaBlock({ ...m, key: "msg --> x" } as any)}\nhello`;
    expect(parseMeta(body)?.key).toBe("msg --> x");
    expect(parseMeta(withMeta(body, { ...m, attempts: 2 } as any))?.attempts).toBe(2);
  });
  it("PR comment sections are in C9 order with words", () => {
    const md = renderPrComment({ v: 1, summary: { pass: 4, fail: 1, pending: 1, untested: 1 }, edges: [{ contract: "A", producer: "x", consumer: "y", status: "fail", topFailure: "boom | pipe", repro: "lanes check" }], change: { classification: "minor", reasons: ["r"] }, overrides: [{ file: "f", reason: "why" }], queue: { state: "blocked", reason: "conflict" } });
    expect(md).toMatch(/^<!-- lanes:pr -->\n\*\*Lanes:\*\* ✅ 4 pass · ❌ 1 fail · ⏳ 1 pending · ○ 1 untested/);
    const order = ["| Contract", "**Contract change:** `minor`", "**Overrides:**", "**Queue:** ⛔ blocked: conflict"].map((s) => md.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(md).toContain("boom \\| pipe");
  });
  it("linked issues", () => expect(linkedIssues("Fixes #12, closes #3 and resolved #4; not #5")).toEqual([12, 3, 4]));
});

describe("status numbers", () => {
  it("auto-merge share, revert rate and median blocker → merge", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    const t = (h: number) => new Date(now - h * 3_600_000).toISOString();
    const prs = [
      { number: 1, title: "fix(brain): x", merged_at: t(10), labels: [{ name: "auto-fix" }], body: "Fixes #10" },
      { number: 2, title: "feat", merged_at: t(5), labels: [], body: "" },
      { number: 3, title: 'Revert "feat"', merged_at: t(4), labels: [], body: "" },
      { number: 4, title: "old", merged_at: t(24 * 9), labels: [], body: "" },
    ];
    const n = threeNumbers(prs, (i) => (i === 10 ? { created: now - 12 * 3_600_000, blocker: true } : undefined), now);
    expect(n).toEqual({ merged: 3, auto: 1, reverted: 1, median: 2 * 3_600_000 });
  });
});

describe("config + graph", () => {
  it("planning warnings", () => {
    const cfg = LanesConfig.parse({ lanes_version: "^0.1.0", approvers: [], capacity: { laptops: 1, sessions_per_laptop: 1 }, lanes: { a: { owner: "@a", paths: ["a/**"] }, b: { owner: "@b", paths: ["b/**"] }, c: { owner: "@c", paths: ["c/**"] } }, contracts: Object.fromEntries(["P", "Q", "R", "S"].map((n) => [n, { producer: "a", consumers: ["b"] }])) });
    const w = planningWarnings(cfg).join("\n");
    expect(w).toMatch(/3 lanes but only 1 sessions/);
    expect(w).toMatch(/lane "c" has no contracts/);
    expect(w).toMatch(/a ↔ b share 4 contracts/);
  });
  it("graph-data counts issues per lane", () => {
    const g = graphFromReport({ v: 1, startedAt: 1, durationMs: 1, mode: "local", seed: 1, edges: [{ contract: "A", producer: "x", consumer: "y", status: "fail", version: "1.0.0", fixtures: { valid: 1, invalid: 1 }, consumerTests: 1, failures: [{ check: "schema", message: "m", owner: "x" }], pendingIssues: [] }], failures: [], lock: { ok: true, changed: [] }, ownership: { violations: [], overrides: [] }, warnings: [], summary: { pass: 0, fail: 1, pending: 0, untested: 0 } },
      { owners: { x: "@x", y: "@y" }, issues: [{ number: 5, title: "t", labels: ["lanes:blocker", "lane:x", "claimed", "needs-owner"], state: "open" }] });
    expect(GraphData.parse(g).nodes.find((n) => n.lane === "x")).toMatchObject({ openBlockers: 1, claimedFixes: [5] });
    expect(g.needsOwner).toEqual([{ issue: 5, title: "t", to: "x" }]);
    expect(g.edges[0].topFailure).toEqual({ message: "m", owner: "x" });
  });
});
