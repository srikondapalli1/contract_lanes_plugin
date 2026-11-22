import { describe, expect, it } from "vitest";
import { fixturesOf } from "../../test/index.ts";
import { schema } from "../../contracts/LanesConfig.ts";

describe("github consumes LanesConfig", () => {
  it.each(fixturesOf("LanesConfig").valid)("reads fix budgets and lane owners from fixture %#", (raw) => {
    const cfg = schema.parse(raw);
    expect(cfg.settings.fix_attempts).toBeGreaterThan(0);
    expect(cfg.settings.lease_minutes).toBeGreaterThan(0);
    for (const l of Object.values(cfg.lanes)) expect(l.owner.length).toBeGreaterThan(0);
  });
});
