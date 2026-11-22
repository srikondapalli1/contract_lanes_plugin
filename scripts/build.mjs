// Bundles the CLI + test helpers into plugin/bin (committed: plugins install from git with no build step).
import { build } from "esbuild";
import { chmodSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = new URL("../plugin/bin/", import.meta.url).pathname;
for (const f of readdirSync(out)) if (f !== "lanes") rmSync(join(out, f), { recursive: true, force: true });
await build({
  entryPoints: { lanes: "packages/core/src/cli/main.ts", test: "packages/core/src/test/index.ts" },
  bundle: true, platform: "node", format: "esm", target: "node20",
  splitting: true, outdir: out, outExtension: { ".js": ".mjs" }, chunkNames: "chunks/[name]-[hash]",
  loader: { ".html": "text" },
  banner: { js: 'import { createRequire as __lanesRequire } from "node:module"; const require = __lanesRequire(import.meta.url);' }, minifySyntax: true, minifyWhitespace: true, legalComments: "none", logLevel: "warning",
});
writeFileSync(join(out, "test.d.ts"), `// Types for \`contract-lanes/test\` (consumer-test helpers).
import type * as fcNs from "fast-check";
/** fast-check, the same instance the arbitraries are built with. */
export declare const fc: typeof fcNs;
/** The producer's fixtures for a contract: valid ones parse, invalid ones must fail. */
export declare function fixturesOf<T = unknown>(name: string): { valid: T[]; invalid: unknown[] };
/** The contract's zod schema (loaded through vite; keep contract-lanes in test.server.deps.inline). */
export declare function schemaOf(name: string): Promise<any>;
/** A fast-check arbitrary that generates valid values of the contract. */
export declare function arbitraryOf<T = unknown>(nameOrSchema: string | object): Promise<fcNs.Arbitrary<T>>;
/** Internal: the engine \`lanes check\` runs inside vitest. */
export declare function runEngine(opts: unknown): Promise<unknown>;
`);
writeFileSync(join(out, "lanes"), '#!/bin/sh\n# `lanes` on the Bash PATH while the Claude Code plugin is enabled\nexec node "$(dirname "$0")/lanes.mjs" "$@"\n');
chmodSync(join(out, "lanes"), 0o755);
chmodSync(join(out, "lanes.mjs"), 0o755);
console.log("built plugin/bin/lanes.mjs + test.mjs");
