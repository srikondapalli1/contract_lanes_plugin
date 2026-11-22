import { z } from "zod";
import { LaneName, EpochMs, Edge, Failure } from "./_common.ts";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  generatedAt: EpochMs,
  fromReport: EpochMs,
  repo: z.string().optional(),
  nodes: z.array(z.object({
    lane: LaneName,
    owner: z.string(),
    openBlockers: z.int().min(0),
    openRequests: z.int().min(0),
    claimedFixes: z.array(z.int().min(1)),
  })),
  edges: z.array(Edge.pick({
    contract: true, producer: true, consumer: true, status: true, version: true,
    fixtures: true, consumerTests: true, pendingIssues: true,
  }).extend({
    topFailure: Failure.pick({ message: true, seed: true, repro: true, owner: true }).optional(),
  })),
  needsOwner: z.array(z.object({
    issue: z.int().min(1),
    title: z.string(),
    to: z.union([LaneName, z.literal("approvers")]),
  })),
});
export type GraphData = z.infer<typeof schema>;
