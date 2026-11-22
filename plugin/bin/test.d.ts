// Types for `contract-lanes/test` (consumer-test helpers).
import type * as fcNs from "fast-check";
/** fast-check, the same instance the arbitraries are built with. */
export declare const fc: typeof fcNs;
/** The producer's fixtures for a contract: valid ones parse, invalid ones must fail. */
export declare function fixturesOf<T = unknown>(name: string): { valid: T[]; invalid: unknown[] };
/** The contract's zod schema (loaded through vite; keep contract-lanes in test.server.deps.inline). */
export declare function schemaOf(name: string): Promise<any>;
/** A fast-check arbitrary that generates valid values of the contract. */
export declare function arbitraryOf<T = unknown>(nameOrSchema: string | object): Promise<fcNs.Arbitrary<T>>;
/** Internal: the engine `lanes check` runs inside vitest. */
export declare function runEngine(opts: unknown): Promise<unknown>;
