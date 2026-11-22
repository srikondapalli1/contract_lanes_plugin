import { z } from "zod";
import { LaneName, EpochMs } from "./_common.ts";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  issue: z.int().min(1),
  lane: LaneName,
  worktree: z.string().min(1),
  branch: z.string().regex(/^fix\/\d+$/),
  repro: z.string().min(1),
  leaseUntil: EpochMs,
  attempt: z.int().min(1),
});
export type FixPlan = z.infer<typeof schema>;
