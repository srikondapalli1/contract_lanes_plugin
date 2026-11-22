// Runs inside a vitest worker (so the project's TS contracts and handlers load through vite).
// Steps 3–6 of `lanes check`: schemas, fixtures, generated checks + mutations, handler property tests.
import fc from "fast-check";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Failure } from "../contracts/_common.ts";
import { arbitraryFor, applyMutation, GenError, mutationsOf, pathString } from "../generate/index.ts";

export interface EnginePlan {
  root: string; seed: number; runs: number; repro: string;
  contracts: { name: string; file: string; producer: string; valid: string[]; invalid: string[] }[];
  handlers: { name: string; lane: string; module: string; exportName: string; input: string; output: string }[];
}
export interface EngineContract { name: string; loaded: boolean; version?: string; jsonSchema?: unknown; fixtures: { valid: number; invalid: number } }
export interface EngineResult { v: 1; contracts: EngineContract[]; failures: Failure[]; warnings: string[] }

export const issuesText = (err: any) =>
  (err?.issues ?? []).slice(0, 3).map((i: any) => `${pathString(i.path ?? []) }: ${i.message}`).join("; ") || String(err?.message ?? err);
const short = (v: unknown) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 297) + "..." : s; };

export async function runEngine(opts: {
  z: any; plan: EnginePlan; out: string;
  load: Record<string, () => Promise<any>>; handlers: Record<string, () => Promise<any>>;
}): Promise<EngineResult> {
  const { z, plan } = opts;
  const failures: Failure[] = [];
  const warnings: string[] = [];
  const schemas = new Map<string, any>();
  const contracts: EngineContract[] = [];
  const params = { seed: plan.seed, numRuns: plan.runs };
  const repro = (lane: string) => `${plan.repro} check --lane ${lane} --seed ${plan.seed}`;

  for (const c of plan.contracts) {
    const fail = (check: Failure["check"], message: string, extra: Partial<Failure> = {}) =>
      failures.push({ check, contract: c.name, message, owner: c.producer, repro: repro(c.producer), ...extra });
    const res: EngineContract = { name: c.name, loaded: false, fixtures: { valid: c.valid.length, invalid: c.invalid.length } };
    contracts.push(res);
    // 3. schema module
    let mod: any;
    try { mod = await opts.load[c.name](); } catch (e) {
      fail("schema", `${c.file} failed to load: ${String((e as Error)?.message ?? e).split("\n")[0]}`, { file: c.file });
      continue;
    }
    const schema = mod?.schema;
    if (!schema?._zod || typeof schema.safeParse !== "function") { fail("schema", `${c.file} must export \`schema\` (a zod v4 schema)`, { file: c.file }); continue; }
    if (typeof mod.VERSION !== "string" || !/^\d+\.\d+\.\d+/.test(mod.VERSION)) { fail("schema", `${c.file} must export \`VERSION\` as a semver string, e.g. export const VERSION = "1.0.0"`, { file: c.file }); continue; }
    res.loaded = true;
    res.version = mod.VERSION;
    schemas.set(c.name, schema);
    try { res.jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }); } catch (e) {
      warnings.push(`${c.name}: toJSONSchema failed (${(e as Error).message}); lock hashing uses a structural fallback`);
      res.jsonSchema = { fallback: String(schema._zod.def.type) };
    }
    // 4. fixtures
    if (!c.valid.length || !c.invalid.length)
      fail(c.valid.length ? "fixture-invalid" : "fixture-valid", `${c.name} needs at least 1 valid and 1 invalid fixture (has ${c.valid.length} valid, ${c.invalid.length} invalid) under fixtures/${c.name}/`);
    const validValues: { file: string; value: unknown }[] = [];
    for (const [kind, files] of [["valid", c.valid], ["invalid", c.invalid]] as const) for (const f of files) {
      let value: unknown;
      try { value = JSON.parse(readFileSync(join(plan.root, f), "utf8")); } catch (e) {
        fail(`fixture-${kind}`, `${f} is not valid JSON: ${(e as Error).message}`, { file: f }); continue;
      }
      const r = schema.safeParse(value);
      if (kind === "valid" && !r.success) fail("fixture-valid", `${f} should parse but fails: ${issuesText(r.error)}`, { file: f });
      else if (kind === "invalid" && r.success) fail("fixture-invalid", `${f} should fail but parses; make it actually invalid or move it to valid/`, { file: f });
      if (kind === "valid" && r.success) validValues.push({ file: f, value });
    }
    // 5a. generated instances must parse (catches impossible schemas)
    const ctx = { warnings: [] as string[] };
    let arb: fc.Arbitrary<unknown> | null = null;
    try { arb = arbitraryFor(schema, "", ctx); } catch (e) { ctx.warnings.push(`generation: ${(e as Error).message}`); }
    warnings.push(...ctx.warnings.map((w) => `${c.name}: ${w}`));
    if (arb) {
      const out = fc.check(fc.property(arb, (v) => { const r = schema.safeParse(v); if (!r.success) throw new Error(issuesText(r.error)); }), params);
      const err: any = (out as any).errorInstance ?? (out as any).error;
      if (out.failed && err instanceof GenError) warnings.push(`${c.name}: generation: ${err.message}`);
      else if (out.failed) fail("generated", `a value generated from ${c.name}'s own schema is rejected by it (${String(err?.message ?? err).split("\n")[0]}); the schema may be impossible to satisfy`, {
        seed: out.seed, counterexample: out.counterexample?.[0],
      });
    } else warnings.push(`${c.name}: generated checks skipped (unsupported types above)`);
    // 5b. mutations of valid fixtures must fail
    const accepted: string[] = [];
    for (const { file, value } of validValues) for (const m of mutationsOf(schema, value)) {
      if (schema.safeParse(applyMutation(value, m)).success) accepted.push(`${m.kind} at ${pathString(m.path)} of ${file}${m.kind === "drop" ? "" : ` (→ ${short(m.value)})`}`);
    }
    if (accepted.length) fail("mutation", `${accepted.length} mutation(s) of valid fixtures still parse, e.g. ${accepted[0]}; tighten the schema`, { detail: accepted.slice(0, 10).join("\n") });
  }

  // 6. handler property tests: generated inputs -> handler -> output must validate
  for (const h of plan.handlers) {
    const fail = (message: string, extra: Partial<Failure> = {}) =>
      failures.push({ check: "handler-property", contract: h.output, message, owner: h.lane, file: h.module, repro: repro(h.lane), ...extra });
    const inS = schemas.get(h.input), outS = schemas.get(h.output);
    if (!inS || !outS) { warnings.push(`handler ${h.name}: skipped because ${!inS ? h.input : h.output} did not load`); continue; }
    let fn: any;
    try { fn = (await opts.handlers[h.name]())?.[h.exportName]; } catch (e) {
      fail(`handler ${h.name}: ${h.module} failed to load: ${String((e as Error)?.message ?? e).split("\n")[0]}`); continue;
    }
    if (typeof fn !== "function") { fail(`handler ${h.name}: ${h.module} has no exported function "${h.exportName}"`); continue; }
    const ctx = { warnings: [] as string[] };
    let arb: fc.Arbitrary<unknown> | null = null;
    try { arb = arbitraryFor(inS, "", ctx); } catch (e) { ctx.warnings.push((e as Error).message); }
    warnings.push(...ctx.warnings.map((w) => `handler ${h.name}: ${w}`));
    if (!arb) { warnings.push(`handler ${h.name}: skipped, can't generate ${h.input}`); continue; }
    const out = await fc.check(fc.asyncProperty(arb, async (input) => {
      const result = await fn(structuredClone(input));
      const r = outS.safeParse(result);
      if (!r.success) throw new Error(`returned an invalid ${h.output}: ${issuesText(r.error)}`);
    }), params);
    if (out.failed) {
      const err: any = (out as any).errorInstance ?? (out as any).error;
      const msg = String(err?.message ?? err).split("\n")[0];
      if (err instanceof GenError) { warnings.push(`handler ${h.name}: ${msg}`); continue; }
      fail(`handler ${h.name} (${h.module}#${h.exportName}) ${msg.startsWith("returned") ? msg : `threw: ${msg}`}`, {
        seed: out.seed, counterexample: out.counterexample?.[0],
        detail: `smallest input after ${out.numShrinks} shrinks: ${short(out.counterexample?.[0])}`,
      });
    }
  }

  const result: EngineResult = { v: 1, contracts, failures, warnings };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(result));
  return result;
}
