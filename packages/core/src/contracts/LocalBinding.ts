import { z } from "zod";
import { LaneName, EpochMs } from "./_common.ts";

export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  lane: LaneName,
  boundAt: EpochMs,
  lastShownInbox: EpochMs.optional(),
});
export type LocalBinding = z.infer<typeof schema>;
