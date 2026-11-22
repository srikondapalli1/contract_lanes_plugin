import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import { schema } from "../../contracts/LanesConfig.ts";

describe("surface consumes LanesConfig", () => {
  it.each(fixturesOf("LanesConfig").valid)("session context can list lanes and contracts (fixture %#)", (raw) => {
    const cfg = schema.parse(raw);
    for (const [, c] of Object.entries(cfg.contracts)) expect(cfg.lanes[c.producer]).toBeDefined();
    expect(typeof cfg.settings.stop_gate).toBe("boolean");
  });
});
