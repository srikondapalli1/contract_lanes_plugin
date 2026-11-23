import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface Run { code: number; stdout: string; stderr: string }

// On Windows these are .cmd shims, which Node only starts through a shell (so their arguments get quoted)
const SHIMS = new Set(["npm", "npx", "pnpm", "yarn", "corepack"]);
const winQuote = (a: string) => (/^[\w@./:=^~-]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);

export function run(cmd: string, args: string[], opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): Run {
  const shell = process.platform === "win32" && SHIMS.has(cmd);
  const r = spawnSync(cmd, shell ? args.map(winQuote) : args, { cwd: opts.cwd, input: opts.input, env: opts.env ?? process.env, encoding: "utf8", maxBuffer: 64 << 20, timeout: opts.timeout, shell });
  return { code: r.status ?? (r.error ? 127 : 1), stdout: r.stdout ?? "", stderr: (r.stderr ?? "") + (r.error ? String(r.error) : "") };
}

export const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

export function gitOk(cwd: string, ...args: string[]): string {
  const r = git(cwd, ...args);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim() || r.stdout.trim()}`);
  return r.stdout.trim();
}

/** Locate the git dir for a worktree without spawning git (fast path for hooks). */
export function gitDir(root: string): string | undefined {
  let dir = root;
  for (;;) {
    const dotgit = join(dir, ".git");
    if (existsSync(dotgit)) {
      if (statSync(dotgit).isDirectory()) return dotgit;
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit, "utf8"));
      return m ? resolve(dir, m[1].trim()) : undefined;
    }
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/** Current branch name read straight from HEAD; undefined when detached or not a repo. */
export function currentBranch(root: string): string | undefined {
  if (process.env.LANES_BRANCH) return process.env.LANES_BRANCH;
  const gd = gitDir(root);
  if (!gd) return undefined;
  try {
    const m = /^ref:\s*refs\/heads\/(.+)$/m.exec(readFileSync(join(gd, "HEAD"), "utf8"));
    return m?.[1].trim();
  } catch { return undefined; }
}

/** Tracked + untracked (non-ignored) files, repo-relative. */
export function repoFiles(root: string): string[] {
  const r = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard");
  return r.code === 0 ? [...new Set(r.stdout.split("\0").filter(Boolean))].sort() : [];
}

/** Files changed in the working tree plus on this branch vs main. */
export function changedFiles(root: string): string[] {
  const out = new Set<string>();
  const st = git(root, "status", "--porcelain", "-z", "--untracked-files=all");
  if (st.code === 0) {
    const parts = st.stdout.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      out.add(p.slice(3));
      if (p[0] === "R" || p[0] === "C") i++; // rename source follows
    }
  }
  const base = ["origin/main", "main"].find((b) => git(root, "rev-parse", "--verify", "-q", b).code === 0);
  if (base && currentBranch(root) !== "main") {
    const d = git(root, "diff", "--name-only", "-z", `${base}...HEAD`);
    if (d.code === 0) d.stdout.split("\0").filter(Boolean).forEach((f) => out.add(f));
  }
  return [...out].sort();
}
