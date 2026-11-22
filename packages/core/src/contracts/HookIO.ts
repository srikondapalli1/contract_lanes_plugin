import { z } from "zod";

// C10: one fixture case = hook stdin + sandbox setup -> expected exit code / output.
export const VERSION = "1.0.0";
export const schema = z.object({
  v: z.literal(1),
  event: z.enum(["session-start", "prompt", "guard", "stop"]),
  setup: z.object({
    lane: z.string().optional(),
    branch: z.string().optional(),
    locked: z.boolean().optional(),
    stop_gate: z.boolean().optional(),
    override: z.array(z.string()).optional(),
    planted_bug: z.boolean().optional(),
  }).optional(),
  stdin: z.object({
    hook_event_name: z.string().optional(),
    cwd: z.string().optional(),
    session_id: z.string().optional(),
    tool_name: z.string().optional(),
    tool_input: z.object({
      file_path: z.string().optional(),
      notebook_path: z.string().optional(),
      command: z.string().optional(),
      edits: z.array(z.object({ file_path: z.string().optional() })).optional(),
    }).optional(),
    stop_hook_active: z.boolean().optional(),
  }),
  expect: z.object({
    exit: z.union([z.literal(0), z.literal(2)]),
    stdout: z.string().optional(),
    stdoutIncludes: z.array(z.string()).optional(),
    stderrIncludes: z.array(z.string()).optional(),
    stderrEmpty: z.boolean().optional(),
    maxMs: z.int().min(1).optional(),
  }),
});
export type HookIO = z.infer<typeof schema>;
