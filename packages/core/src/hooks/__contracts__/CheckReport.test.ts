import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { CheckReport } from "../../contracts/CheckReport.ts";

describe("surface consumes CheckReport", () => {
  it.each(fixturesOf<CheckReport>("CheckReport").valid)("stop gate finds a top failure with an owner (fixture %#)", (r) => {
    const red = r.edges.filter((e) => e.status === "fail");
    for (const e of red) expect(e.failures[0]?.owner).toBeTruthy();
    expect(r.summary.fail).toBe(red.length);
  });
});
