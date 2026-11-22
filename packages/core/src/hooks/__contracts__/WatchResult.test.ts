import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { WatchResult } from "../../contracts/WatchResult.ts";

describe("surface consumes WatchResult", () => {
  it.each(fixturesOf<WatchResult>("WatchResult").valid)("the watch command can restart from `next` (fixture %#)", (w) => {
    expect(w.next).toContain(`watch --lane ${w.lane}`);
    for (const i of w.items) expect(["blocker", "request"]).toContain(i.type);
  });
});
