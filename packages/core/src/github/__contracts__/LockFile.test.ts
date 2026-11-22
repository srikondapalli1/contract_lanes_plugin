import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { LockFile } from "../../contracts/LockFile.ts";

describe("github consumes LockFile", () => {
  it.each(fixturesOf<LockFile>("LockFile").valid)("lists locked contracts for the queue (fixture %#)", (l) => {
    expect(Object.keys(l.contracts).length).toBeGreaterThan(0);
    for (const c of Object.values(l.contracts)) expect(c.schemaHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
