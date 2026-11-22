// `contract-lanes/test`: helpers for consumer tests, plus the engine that `lanes check` runs inside vitest.
import fc from "fast-check";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { arbitraryFor } from "../generate/index.ts";

export { fc };
export { runEngine } from "../check/engine.ts";
export { arbitraryFor, mutationsOf, applyMutation } from "../generate/index.ts";

function root(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "lanes.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error("contract-lanes/test: no lanes.yaml found above the current directory");
    dir = up;
  }
}
const settings = (r: string) => {
  const s = (parseYaml(readFileSync(join(r, "lanes.yaml"), "utf8")) as any)?.settings ?? {};
  return { contracts: s.contracts_dir ?? "contracts", fixtures: s.fixtures_dir ?? "fixtures" };
};
const readSet = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))) : []);

/** The producer's fixtures for a contract: { valid, invalid }. */
export function fixturesOf<T = unknown>(name: string): { valid: T[]; invalid: unknown[] } {
  const r = root();
  const base = join(r, settings(r).fixtures, name);
  if (!existsSync(base)) throw new Error(`fixturesOf("${name}"): no fixtures at ${base}`);
  return { valid: readSet(join(base, "valid")) as T[], invalid: readSet(join(base, "invalid")) };
}

/** The contract's zod schema (loaded through vite: keep contract-lanes in test.server.deps.inline). */
export async function schemaOf(name: string): Promise<any> {
  const r = root();
  const mod = await import(/* @vite-ignore */ join(r, settings(r).contracts, `${name}.ts`));
  if (!mod?.schema) throw new Error(`schemaOf("${name}"): contracts/${name}.ts does not export \`schema\``);
  return mod.schema;
}

/** A fast-check arbitrary generating values of the contract (use the exported `fc` with it). */
export async function arbitraryOf<T = unknown>(nameOrSchema: string | object): Promise<fc.Arbitrary<T>> {
  const schema = typeof nameOrSchema === "string" ? await schemaOf(nameOrSchema) : nameOrSchema;
  const ctx = { warnings: [] as string[] };
  const arb = arbitraryFor(schema, "", ctx);
  if (!arb) throw new Error(`arbitraryOf: can't generate this contract: ${ctx.warnings.join("; ")}`);
  return arb as fc.Arbitrary<T>;
}
