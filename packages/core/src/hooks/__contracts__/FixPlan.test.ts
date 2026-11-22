import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { FixPlan } from "../../contracts/FixPlan.ts";

describe("surface consumes FixPlan", () => {
  it.each(fixturesOf<FixPlan>("FixPlan").valid)("the fixer agent gets a worktree, a branch and a repro (fixture %#)", (p) => {
    expect(p.branch).toBe(`fix/${p.issue}`);
    expect(p.repro).toContain("lanes check");
  });
});
