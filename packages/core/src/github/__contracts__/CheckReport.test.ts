import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { CheckReport } from "../../contracts/CheckReport.ts";
import { blockerKey, prCommentData } from "../index.ts";
import { renderPrComment } from "../../status/prComment.ts";
import { schema as PrComment } from "../../contracts/PrComment.ts";

describe("github consumes CheckReport", () => {
  it.each(fixturesOf<CheckReport>("CheckReport").valid)("renders a C9 PR comment for fixture %#", (r) => {
    const data = PrComment.parse(prCommentData(r, [], { state: "waiting" }));
    const md = renderPrComment(data);
    expect(md.startsWith("<!-- lanes:pr -->")).toBe(true);
    expect(md).toContain(`✅ ${r.summary.pass} pass · ❌ ${r.summary.fail} fail`);
    for (const e of r.edges) expect(md).toContain(`\`${e.contract}\``);
  });
  it.each(fixturesOf<CheckReport>("CheckReport").valid)("blocker keys are stable across seeds (fixture %#)", (r) => {
    for (const f of r.failures) expect(blockerKey({ ...f, seed: 1 })).toBe(blockerKey({ ...f, seed: 999 }));
  });
});
