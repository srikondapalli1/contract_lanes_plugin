import { z } from "zod";
import { LaneName, ContractName } from "./_common.ts";

export const VERSION = "1.1.0";

export const schema = z.object({
  lanes_version: z.string().min(1),
  approvers: z.array(z.string().regex(/^@[A-Za-z0-9-]+(\/[A-Za-z0-9._-]+)?$/)),
  capacity: z.object({
    laptops: z.int().min(1).max(100),
    sessions_per_laptop: z.int().min(1).max(100),
    hours: z.number().min(0).optional(),
  }).optional(),
  settings: z.object({
    autopilot: z.boolean().default(true),
    stop_gate: z.boolean().default(false),
    fix_size_cap: z.int().min(1).default(200),
    fix_attempts: z.int().min(1).default(2),
    lease_minutes: z.int().min(1).default(30),
    property_runs: z.int().min(1).max(100000).default(200),
    watch_interval_sec: z.int().min(10).default(20),
    contracts_dir: z.string().min(1).default("contracts"),
    fixtures_dir: z.string().min(1).default("fixtures"),
  }).default({
    autopilot: true, stop_gate: false, fix_size_cap: 200, fix_attempts: 2, lease_minutes: 30,
    property_runs: 200, watch_interval_sec: 20, contracts_dir: "contracts", fixtures_dir: "fixtures",
  }),
  lanes: z.record(LaneName, z.object({ owner: z.string().min(1), paths: z.array(z.string().min(1)).min(1) })),
  contracts: z.record(ContractName, z.object({ producer: LaneName, consumers: z.array(LaneName) })),
  handlers: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/), z.object({
    lane: LaneName,
    module: z.string().regex(/^[^#]+#[A-Za-z_$][A-Za-z0-9_$]*$/),
    input: ContractName,
    output: ContractName,
  })).optional(),
});

export type LanesConfig = z.infer<typeof schema>;
