import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "../../..");
export const CLI = join(REPO, "plugin/bin/lanes.mjs");
export const FAKE_GH = join(REPO, "packages/core/test/fake-gh.mjs");
export const EXAMPLE = join(REPO, "examples/three-lanes");

export interface R { code: number; stdout: string; stderr: string; ms: number }
export function sh(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}, input?: string): R {
  const t = performance.now();
  const r = spawnSync(cmd, args, { cwd, input, encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr, ms: performance.now() - t };
}
export const git = (cwd: string, ...a: string[]) => {
  const r = sh("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...a], cwd);
  if (r.code) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
export const lanes = (cwd: string, args: string[], env: Record<string, string> = {}, input?: string) => sh(process.execPath, [CLI, ...args], cwd, env, input);

export const tmp = (name: string) => realpathSync(mkdtempSync(join(tmpdir(), `lanes-${name}-`)));

/** Simulate `npm i -D contract-lanes vitest zod` by linking this repo's installs. */
export function linkDeps(dir: string) {
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  for (const d of ["zod", "vitest"]) symlinkSync(realpathSync(join(REPO, "node_modules", d)), join(dir, "node_modules", d), "dir");
  symlinkSync(REPO, join(dir, "node_modules", "contract-lanes"), "dir");
  symlinkSync(CLI, join(dir, "node_modules", ".bin", "lanes"));
}

export function exampleRepo(name: string, opts: { fixBug?: boolean } = {}): string {
  const dir = tmp(name);
  cpSync(EXAMPLE, dir, { recursive: true, filter: (src) => !/[\\/](node_modules|\.lanes)([\\/]|$)/.test(src) });
  linkDeps(dir);
  if (opts.fixBug) setHold(dir, 1200);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
  return dir;
}

export function setHold(dir: string, ms: number) {
  const f = join(dir, "apps/brain/src/tick.ts");
  writeFileSync(f, readFileSync(f, "utf8").replace(/holdMs: \d+ \};/, `holdMs: ${ms} };`));
}

/** A bare "GitHub" remote + fake gh state; returns env for the CLI. */
export function fakeGitHub(work: string, repo = "acme/manor") {
  const base = tmp("remote");
  const remote = join(base, "origin.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  git(work, "remote", "add", "origin", remote);
  git(work, "push", "-q", "-u", "origin", "main");
  const state = join(base, "gh.json");
  writeFileSync(state, JSON.stringify({ repo, remote, next: 1, user: "agent", issues: {}, comments: {}, labels: [], reviews: {}, statuses: [] }));
  const env = { LANES_GH: FAKE_GH, FAKE_GH_STATE: state, LANES_REPO: repo, LANES_ME: "agent", GH_TOKEN: "fake" };
  return { remote, state, env, read: () => JSON.parse(readFileSync(state, "utf8")) };
}

/** A fresh clone of the remote playing the CI runner. */
export function ciClone(remote: string): string {
  const dir = tmp("ci");
  git(dir, "clone", "-q", remote, ".");
  git(dir, "config", "user.name", "lanes-queue");
  git(dir, "config", "user.email", "q@example.com");
  linkDeps(dir);
  return dir;
}
