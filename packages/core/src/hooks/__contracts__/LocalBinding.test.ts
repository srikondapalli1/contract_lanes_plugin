import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { LocalBinding } from "../../contracts/LocalBinding.ts";

describe("surface consumes LocalBinding", () => {
  it.each(fixturesOf<LocalBinding>("LocalBinding").valid)("prompt hook can compare lastShownInbox (fixture %#)", (b) => {
    expect(b.lane).toMatch(/^[a-z]/);
    expect(b.lastShownInbox ?? 0).toBeGreaterThanOrEqual(0);
  });
});
