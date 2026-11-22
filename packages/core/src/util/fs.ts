import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export const CONFIG_FILE = "lanes.yaml";
export const LOCK_FILE = "contracts.lock";

export function findRoot(cwd: string): string | undefined {
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

export const cacheDir = (root: string) => join(root, ".lanes", "cache");
export const cachePath = (root: string, name: string) => join(cacheDir(root), name);

export function readJson<T = any>(file: string): T | undefined {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return undefined; }
}

export function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function writeText(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export function logHookError(root: string | undefined, err: unknown) {
  if (!root) return;
  try {
    mkdirSync(cacheDir(root), { recursive: true });
    appendFileSync(cachePath(root, "hook-errors.log"), `${new Date().toISOString()} ${String((err as Error)?.stack ?? err)}\n`);
  } catch { /* never fail a hook on logging */ }
}

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export const toPosix = (p: string) => p.split(sep).join("/");
export const rel = (root: string, abs: string) => toPosix(relative(root, abs));

export function mtime(file: string): number {
  try { return statSync(file).mtimeMs; } catch { return 0; }
}

/** Sorted repo-relative files under dir (recursive). */
export function listDir(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let ents: import("node:fs").Dirent[] = [];
    try { ents = readdirSync(join(root, d), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = d ? `${d}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Deterministic JSON: object keys sorted. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().filter((k) => (v as any)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
