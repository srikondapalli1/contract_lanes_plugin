import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import { metaBlock, parseMeta } from "../../github/index.ts";
import type { IssueMeta } from "../../contracts/IssueMeta.ts";

describe("core consumes IssueMeta", () => {
  it.each(fixturesOf<IssueMeta>("IssueMeta").valid)("round-trips through the issue machine block (fixture %#)", (m) => {
    const body = `${metaBlock(m)}\nhuman text with --> arrows`;
    expect(parseMeta(body)).toEqual(m);
  });
  it.each(fixturesOf("IssueMeta").invalid)("ignores malformed machine blocks (invalid %#)", (m) => {
    expect(parseMeta(`<!-- lanes:${JSON.stringify(m)} -->`)).toBeUndefined();
  });
});
