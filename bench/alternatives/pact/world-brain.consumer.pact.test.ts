// Pact consumer test: world (consumer) calls brain (provider) with a TickRequest and uses the TickResponse.
// Same example inputs as the Lanes fixtures (fixtures/TickRequest/valid/*), plus one spooked agent so every mood is exercised.
import { MatchersV3, PactV4 } from "@pact-foundation/pact";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTick } from "../apps/world/src/apply";

const { eachLike, integer, regex, like } = MatchersV3;
const pact = new PactV4({ consumer: "world", provider: "brain", dir: resolve(import.meta.dirname, "pacts"), logLevel: "error" });

const postTick = async (url: string, body: unknown) => {
  const r = await fetch(`${url}/tick`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
};
const action = (kind: "move" | "wait" | "flee", holdMs: number, withTo: boolean) => ({
  agentId: regex("^a-[0-9]{1,4}$", "a-1"),
  kind: regex("^(move|wait|flee)$", kind),
  ...(withTo ? { to: like({ x: integer(1), y: integer(2) }) } : {}),
  holdMs: integer(holdMs),
});

const cases = [
  { name: "an empty world", req: { tick: 0, worldId: "void", agents: [] }, res: { tick: 0, actions: [] } },
  {
    name: "three calm/curious agents",
    req: { tick: 42, worldId: "manor", agents: [
      { id: "a-1", at: { x: 3, y: 4 }, mood: "calm" }, { id: "a-2", at: { x: 10, y: 2 }, mood: "curious" }, { id: "a-3", at: { x: 0, y: 63 }, mood: "calm" },
    ], haunts: [{ id: "h-01", at: { x: 5, y: 5 }, intensity: 6.5 }] },
    res: { tick: 42, actions: eachLike(action("wait", 250, false), 3) },
  },
  {
    name: "one spooked agent",
    req: { tick: 7, worldId: "manor", agents: [{ id: "a-9", at: { x: 5, y: 5 }, mood: "spooked" }] },
    res: { tick: 7, actions: eachLike(action("flee", 1200, true), 1) },
  },
];

describe("world → brain (Pact consumer)", () => {
  for (const c of cases) {
    it(`tick for ${c.name}`, () =>
      pact.addInteraction()
        .uponReceiving(`a tick for ${c.name}`)
        .withRequest("POST", "/tick", (b) => b.jsonBody(c.req))
        .willRespondWith(200, (b) => b.jsonBody(c.res))
        .executeTest(async (mock) => {
          const res = await postTick(mock.url, c.req);
          const sprites = res.actions.map((a: { agentId: string }) => ({ id: a.agentId, x: 0, y: 0, animMs: 0 }));
          expect(() => applyTick(sprites, res)).not.toThrow();
        }));
  }
});
