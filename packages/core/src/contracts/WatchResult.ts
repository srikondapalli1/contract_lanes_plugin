import { z } from "zod";
import { LaneName, ContractName } from "./_common.ts";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  lane: LaneName,
  items: z.array(z.object({
    issue: z.int().min(1),
    type: z.enum(["blocker", "request"]),
    contract: ContractName.optional(),
    reason: z.enum(["new", "updated", "human-comment"]),
    autopilot: z.boolean(),
  })),
  next: z.string().min(1),
});
export type WatchResult = z.infer<typeof schema>;
