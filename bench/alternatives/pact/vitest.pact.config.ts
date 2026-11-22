import { defineConfig } from "vitest/config";
// pact.mjs runs the consumer file first (writes pacts/world-brain.json), then the provider file.
export default defineConfig({ test: { include: ["pact/**/*.pact.test.ts"], testTimeout: 60_000 } });
