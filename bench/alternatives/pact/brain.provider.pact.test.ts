// Pact provider verification: replay world's recorded interactions against brain's real tick handler over HTTP.
// Uses pact-core's verifier (the Rust verifier that @pact-foundation/pact's `Verifier` wraps) directly: the JS
// `Verifier` adds a local proxy that forwards through HTTPS_PROXY without honouring NO_PROXY, which breaks
// localhost verification in a proxied sandbox. Same matching rules, same output.
import pactCore from "@pact-foundation/pact-core";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { tick } from "../apps/brain/src/tick";

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const out = JSON.stringify(tick(JSON.parse(body)));
      res.writeHead(200, { "content-type": "application/json" }).end(out);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
});

describe("brain honours world's pact (Pact provider)", () => {
  beforeAll(() => new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok)));
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));
  it("verifies", () =>
    pactCore.verifyPacts({
      provider: "brain",
      providerBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      pactUrls: [resolve(import.meta.dirname, "pacts/world-brain.json")],
      logLevel: "error",
    }), 60_000);
});
