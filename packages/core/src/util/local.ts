// Per-worktree state under .lanes/ (gitignored). No zod here: hooks import this on the fast path.
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./fs.ts";
import { run, type Run } from "./git.ts";

export interface Binding { v: 1; lane: string; boundAt: number; lastShownInbox?: number }
export interface Override { path: string; reason: string; at: number; until: number }

export const bindingFile = (root: string) => join(root, ".lanes", "local.json");
export const overrideFile = (root: string) => join(root, ".lanes", "override.json");

export function readBinding(root: string): Binding | undefined {
  const b = readJson<Binding>(bindingFile(root));
  return b && typeof b.lane === "string" ? b : undefined;
}
export const writeBinding = (root: string, b: Binding) => writeJson(bindingFile(root), b);

export function readOverrides(root: string, now = Date.now()): Override[] {
  return (readJson<{ entries?: Override[] }>(overrideFile(root))?.entries ?? []).filter((o) => o.until > now);
}
export function addOverrides(root: string, paths: string[], reason: string, minutes = 30): Override[] {
  const now = Date.now();
  const entries = [...readOverrides(root, now).filter((o) => !paths.includes(o.path)), ...paths.map((path) => ({ path, reason, at: now, until: now + minutes * 60_000 }))];
  writeJson(overrideFile(root), { v: 1, entries });
  return entries;
}

/** How to invoke this CLI from the project (what we print in repro/next commands). */
export function cliCommand(root: string): string {
  if (process.env.LANES_CLI) return process.env.LANES_CLI;
  if (existsSync(join(root, "node_modules", ".bin", "lanes"))) return "npx lanes";
  const bin = selfBin();
  return bin ? `node ${bin}` : "lanes";
}

/** Absolute path of the bundled CLI (plugin/bin/lanes.mjs), when running from the bundle. */
export function selfBin(): string | undefined {
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    return [join(dirname(self), "lanes.mjs"), join(dirname(self), "..", "lanes.mjs")].find(existsSync);
  } catch { return undefined; }
}

export const VERSION_STR = "0.1.6";

/** Run this same CLI as a subprocess (used by queue/fix gates). */
export function selfExec(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Run {
  const bin = selfBin();
  const e = { ...process.env, ...env };
  return bin ? run(process.execPath, [bin, ...args], { cwd, env: e }) : run("npx", ["lanes", ...args], { cwd, env: e });
}
