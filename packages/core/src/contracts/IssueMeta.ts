import { z } from "zod";
import { LaneName, ContractName, EpochMs, Failure } from "./_common.ts";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  type: z.enum(["blocker", "request", "notice", "control", "handoff"]),
  to: z.union([LaneName, z.literal("approvers")]),
  from: z.union([LaneName, z.literal("ci"), z.literal("human")]),
  contract: ContractName.optional(),
  key: z.string().min(1),
  attempts: z.int().min(0).optional(),
  lease: z.object({ by: z.string().min(1), until: EpochMs }).optional(),
  failure: Failure.optional(),
});
export type IssueMeta = z.infer<typeof schema>;
