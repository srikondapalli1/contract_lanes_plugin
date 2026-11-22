import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesOf } from "../../test/index.ts";
import type { GraphData } from "../../contracts/GraphData.ts";

const html = readFileSync(join(import.meta.dirname, "../../../web/graph.html"), "utf8");

describe("surface consumes GraphData", () => {
  it("the graph page reads every field it renders from C6", () => {
    for (const k of ["nodes", "edges", "needsOwner", "topFailure", "claimedFixes", "openBlockers", "openRequests", "pendingIssues", "consumerTests"]) expect(html).toContain(k);
  });
  it.each(fixturesOf<GraphData>("GraphData").valid)("every edge endpoint is a node (fixture %#)", (g) => {
    const lanes = new Set(g.nodes.map((n) => n.lane));
    for (const e of g.edges) { expect(lanes.has(e.producer)).toBe(true); expect(lanes.has(e.consumer)).toBe(true); }
  });
});
