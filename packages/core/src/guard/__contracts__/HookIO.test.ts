import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import type { HookIO } from "../../contracts/HookIO.ts";
import { decideBash } from "../index.ts";

const map = { lockPresent: true, lanes: {}, locked: [], configMtime: 0, lockMtime: 0 };

describe("core consumes HookIO", () => {
  it.each(fixturesOf<HookIO>("HookIO").valid.filter((c) => c.event === "guard" && c.stdin.tool_input?.command))("bash guard agrees with fixture %#", (c) => {
    const d = decideBash("/r", { ...map, lockPresent: !!c.setup?.locked }, c.setup?.branch ?? "main", [], c.stdin.tool_input!.command!);
    expect(d.allow ? 0 : 2).toBe(c.expect.exit);
  });
});
