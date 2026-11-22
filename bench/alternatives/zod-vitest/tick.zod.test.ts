// "No tooling" baseline: what an agent writes by hand with zod + vitest. Replays the valid TickRequest fixtures
// through brain's handler and validates each output against the TickResponse schema. Example-based only.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schema as TickRequest } from "../../../contracts/TickRequest";
import { schema as TickResponse } from "../../../contracts/TickResponse";
import { tick } from "./tick";

const dir = join(import.meta.dirname, "../../../fixtures/TickRequest/valid");
const requests = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

describe("brain tick honours TickResponse", () => {
  it.each(requests)("valid output for fixture %#", (req) => {
    TickRequest.parse(req);
    const res = TickResponse.safeParse(tick(req));
    expect(res.success, JSON.stringify(res.error?.issues)).toBe(true);
  });
});
