import { z } from "zod";

export const LaneName = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const ContractName = z.string().regex(/^[A-Z][A-Za-z0-9]{0,63}$/);
export const EpochMs = z.int().min(0);
export const EdgeStatus = z.enum(["pass", "fail", "pending", "untested"]);
export const CheckKind = z.enum([
  "schema", "fixture-valid", "fixture-invalid", "generated", "mutation",
  "handler-property", "consumer-test", "lock", "ownership", "config",
]);

export const Failure = z.object({
  check: CheckKind,
  contract: ContractName.optional(),
  message: z.string().min(1),
  detail: z.string().optional(),
  file: z.string().optional(),
  seed: z.int().optional(),
  counterexample: z.unknown().optional(),
  repro: z.string().optional(),
  owner: LaneName,
});

export const Edge = z.object({
  contract: ContractName,
  producer: LaneName,
  consumer: LaneName,
  status: EdgeStatus,
  version: z.string(),
  fixtures: z.object({ valid: z.int().min(0), invalid: z.int().min(0) }),
  consumerTests: z.int().min(0),
  failures: z.array(Failure),
  pendingIssues: z.array(z.int().min(1)),
});

export type Failure = z.infer<typeof Failure>;
export type Edge = z.infer<typeof Edge>;
export type EdgeStatus = z.infer<typeof EdgeStatus>;
