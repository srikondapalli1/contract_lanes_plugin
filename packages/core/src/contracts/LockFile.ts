import { z } from "zod";
import { ContractName, EpochMs, LaneName } from "./_common.ts";

export const VERSION = "1.1.0";
const sha = z.string().regex(/^[0-9a-f]{64}$/);
export const schema = z.object({
  v: z.literal(1),
  lockedAt: EpochMs,
  lanes_version: z.string(),
  contracts: z.record(ContractName, z.object({
    version: z.string(),
    schemaHash: sha,
    fixturesHash: sha,
    consumerTestsHash: z.record(LaneName, sha),
    // 1.1 (minor): kept so contract branches can be classified without loading old code
    jsonSchema: z.unknown().optional(),
    fixtureFiles: z.record(z.string(), sha).optional(),
  })),
});
export type LockFile = z.infer<typeof schema>;
