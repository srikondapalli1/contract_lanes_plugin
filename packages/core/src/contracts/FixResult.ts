import { z } from "zod";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  issue: z.int().min(1),
  outcome: z.enum(["queued", "escalated", "rejected"]),
  pr: z.int().min(1).optional(),
  reasons: z.array(z.string()).optional(),
});
export type FixResult = z.infer<typeof schema>;
