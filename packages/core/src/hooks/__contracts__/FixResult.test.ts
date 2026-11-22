import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { FixResult } from "../../contracts/FixResult.ts";

describe("surface consumes FixResult", () => {
  it.each(fixturesOf<FixResult>("FixResult").valid)("queued results carry a PR, others carry reasons (fixture %#)", (r) => {
    if (r.outcome === "queued") expect(r.pr).toBeGreaterThan(0);
    else expect(r.reasons?.length).toBeGreaterThan(0);
  });
});
