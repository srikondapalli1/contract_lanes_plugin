import { z } from "zod";
import { LaneName, ContractName, EpochMs, Edge, Failure } from "./_common.ts";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  startedAt: EpochMs,
  durationMs: z.int().min(0),
  mode: z.enum(["local", "fast", "ci"]),
  lane: LaneName.optional(),
  seed: z.int(),
  commit: z.string().optional(),
  branch: z.string().optional(),
  edges: z.array(Edge),
  failures: z.array(Failure),
  lock: z.object({
    ok: z.boolean(),
    changed: z.array(ContractName),
    classification: z.enum(["minor", "major"]).optional(),
    reasons: z.array(z.string()).optional(),
  }),
  ownership: z.object({
    lane: LaneName.optional(),
    violations: z.array(z.object({ file: z.string(), owner: LaneName })),
    overrides: z.array(z.object({ file: z.string(), reason: z.string() })),
  }),
  warnings: z.array(z.string()),
  summary: z.object({
    pass: z.int().min(0), fail: z.int().min(0), pending: z.int().min(0), untested: z.int().min(0),
  }),
});
export type CheckReport = z.infer<typeof schema>;
