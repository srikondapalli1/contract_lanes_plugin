---
name: lanes-contracts
description: Use when writing or changing a Lanes contract (contracts/<Name>.ts zod schema), its fixtures, a consumer test (__contracts__/<Name>.test.ts), or a handler binding; when lanes check reports schema/fixture/generated/mutation/handler-property/lock failures; or when deciding if a contract change is minor or major.
---

# Contracts, fixtures, consumer tests, handlers

## Contract file: `contracts/<Name>.ts`
```ts
import { z } from "zod";
import { Point } from "./_common";     // only zod and contracts/_common.ts may be imported
export const VERSION = "1.0.0";        // semver; bump it when the schema changes
export const schema = z.object({ id: z.string().min(1), at: Point, holdMs: z.int().min(0).max(1500) });
export type Name = z.infer<typeof schema>;
```
Exactly one lane produces it (lanes.yaml `contracts.<Name>.producer`).
Generation supports `object, string (min/max/regex), number/int (min/max), boolean, enum, literal,
array (min/max), optional, nullable, union, record`. Anything else is skipped with a warning naming the field.
Prefer explicit bounds: they become generated edge cases and mutation tests.

## Fixtures (producer-owned)
`fixtures/<Name>/valid/*.json` must parse; `fixtures/<Name>/invalid/*.json` must fail. At least one of each.
Make invalid fixtures fail for one clear reason (`missing-id.json`, `hold-too-long.json`).
`lanes check` also mutates valid fixtures (drops required fields, wrong types, out-of-range values)
and requires every mutation to fail. If a mutation still parses, tighten the schema.

## Consumer tests (consumer-owned)
`<your lane path>/**/__contracts__/<Name>.test.ts` proves **your code** handles the producer's fixtures:
```ts
import { describe, expect, it } from "vitest";
import { arbitraryOf, fc, fixturesOf } from "contract-lanes/test";
import type { Name } from "../../../contracts/Name";
import { render } from "../render";
describe("world consumes Name", () => {
  it.each(fixturesOf<Name>("Name").valid)("renders fixture %#", (x) => expect(render(x)).toBeTruthy());
  it("renders anything valid", async () => fc.assert(fc.property(await arbitraryOf<Name>("Name"), (x) => !!render(x))));
});
```
Use the `fc` exported by `contract-lanes/test`. No consumer test means the edge is **untested**.

## Handler bindings: the check agents can't fake
```yaml
handlers:
  tick: { lane: brain, module: "apps/brain/src/tick.ts#tick", input: TickRequest, output: TickResponse }
```
`lanes check` generates `property_runs` inputs, calls the handler, and validates every output, then shrinks
failures to the smallest counterexample and prints the seed. The handler's lane must produce the output contract.
Fix the implementation, never the contract, to make a handler property pass.

## Changing a locked contract
Work on `contract/<Name>-<slug>`. Producers edit schema and fixtures; consumers edit their own tests.
`lanes check` classifies the change against contracts.lock:
- **minor**: optional property added, fixture added, enum value added (warns: exhaustive consumers may break).
  The queue relocks automatically after a green check and notifies consumers.
- **major**: anything else (removed or renamed field, new required field, tighter bounds, edited or removed fixture).
  Needs an approver's approving review before the queue merges.

## Breaking changes: expand → migrate → contract
1. **Expand**: add `<Name>V2` (new file, new contract in lanes.yaml) next to v1. This is a minor change.
2. **Migrate**: each consumer moves to V2 in its own PR, in its own lane.
3. **Contract**: delete v1 once no consumer reads it (the graph shows who still consumes it).
Never break consumers in one step.
