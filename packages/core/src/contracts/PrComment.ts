import { z } from "zod";
import { ContractName, LaneName, EdgeStatus } from "./_common.ts";

// C9 is markdown; this is the structured input it is rendered from (see status/prComment.ts).
export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  summary: z.object({ pass: z.int().min(0), fail: z.int().min(0), pending: z.int().min(0), untested: z.int().min(0) }),
  edges: z.array(z.object({
    contract: ContractName, producer: LaneName, consumer: LaneName, status: EdgeStatus,
    topFailure: z.string().optional(), repro: z.string().optional(),
  })),
  change: z.object({ classification: z.enum(["none", "minor", "major"]), reasons: z.array(z.string()) }),
  overrides: z.array(z.object({ file: z.string(), reason: z.string() })),
  queue: z.object({
    state: z.enum(["waiting", "rebasing", "checking", "merged", "blocked", "failed", "not-queued"]),
    reason: z.string().optional(),
  }),
});
export type PrComment = z.infer<typeof schema>;
