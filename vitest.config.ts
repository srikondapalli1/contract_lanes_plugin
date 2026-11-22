import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/core/test/**/*.test.ts", "packages/core/src/**/__contracts__/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.lanes/**", "examples/**"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: true,
  },
});
