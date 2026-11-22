// The ownership + lock guard. Fast path: reads .lanes/cache/ownership.json, no zod/yaml/vitest.
import { isAbsolute, join, relative } from "node:path";
import { CONFIG_FILE, LOCK_FILE, cachePath, mtime, readJson, toPosix } from "../util/fs.ts";
import { matches } from "../util/glob.ts";
import { git } from "../util/git.ts";
import { cliCommand, readOverrides, type Binding, type Override } from "../util/local.ts";

export interface Map { lockPresent: boolean; lanes: Record<string, { owner: string; globs: string[] }>; locked: string[]; configMtime: number; lockMtime: number }
export type Decision = { allow: true } | { allow: false; message: string };
const ALLOW: Decision = { allow: true };

export async function loadMap(root: string): Promise<Map | undefined> {
  const m = readJson<Map>(cachePath(root, "ownership.json"));
  if (m && m.configMtime === mtime(join(root, CONFIG_FILE)) && m.lockMtime === mtime(join(root, LOCK_FILE))) return m;
  const { loadConfig, writeOwnership } = await import("../config/index.ts"); // slow path: cache is stale
  const { cfg } = loadConfig(root);
  return cfg ? writeOwnership(root, cfg) : undefined;
}

const laneOf = (map: Map, f: string) => Object.entries(map.lanes).find(([, d]) => matches(f, d.globs))?.[0];
const overridden = (ovr: Override[], f: string) => ovr.some((o) => o.path === f || matches(f, [o.path]));

export function decideEdit(root: string, map: Map, binding: Binding | undefined, branch: string | undefined, ovr: Override[], file: string): Decision {
  const abs = isAbsolute(file) ? file : join(root, file);
  const f = toPosix(relative(root, abs));
  if (!f || f.startsWith("..") || f.startsWith(".lanes/")) return ALLOW;
  if (overridden(ovr, f)) return ALLOW;
  const cli = cliCommand(root);
  const owner = laneOf(map, f);
  if (binding && owner && owner !== binding.lane)
    return { allow: false, message: `Blocked: ${f} belongs to lane "${owner}"; you are in "${binding.lane}". Ask instead: ${cli} msg ${owner} --type request "<what you need>". Override (logged): ${cli} override ${f} --reason "<why>".` };
  if (map.lockPresent && matches(f, map.locked) && !branch?.startsWith("contract/")) {
    const name = /([A-Z][A-Za-z0-9]*)(?:\.test)?\.[a-z]+$|\/([A-Z][A-Za-z0-9]*)\//.exec(f);
    const c = name?.[1] ?? name?.[2] ?? "<Name>";
    return { allow: false, message: `Blocked: ${f} is locked by ${LOCK_FILE}. Locked contracts change only on a contract branch: git switch -c contract/${c}-<slug>. Override (logged): ${cli} override ${f} --reason "<why>".` };
  }
  return ALLOW;
}

/** Bash: block pushes to main (after lock) and force-pushes. File writes via shell are caught by the git hook. */
export function decideBash(root: string, map: Map, branch: string | undefined, ovr: Override[], command: string): Decision {
  if (overridden(ovr, "@push")) return ALLOW;
  const cli = cliCommand(root);
  for (const seg of command.split(/&&|\|\||[;|\n]/)) {
    const t = seg.trim().split(/\s+/).map((x) => x.replace(/^['"]|['"]$/g, ""));
    let i = t.indexOf("git");
    if (i < 0) continue;
    i++;
    while (t[i] && t[i].startsWith("-")) i += ["-C", "-c", "--git-dir", "--work-tree"].includes(t[i]) ? 2 : 1;
    if (t[i] !== "push") continue;
    const args = t.slice(i + 1);
    const force = args.some((a) => /^--force(-with-lease|-if-includes)?(=|$)/.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || (/^\+/.test(a)));
    if (force) return { allow: false, message: `Blocked: force-push rewrites shared history. Push a new commit instead (git revert / a follow-up fix). Override (logged): ${cli} override @push --reason "<why>".` };
    const pos = args.filter((a, k) => !a.startsWith("-") && !["-o", "--push-option", "--repo"].includes(args[k - 1]));
    const refs = pos.slice(1);
    const toMain = args.includes("--all") || args.includes("--mirror") || (refs.length ? refs.some((r) => /^(refs\/heads\/)?main$/.test(r.includes(":") ? r.split(":")[1] : r)) : branch === "main");
    if (toMain && map.lockPresent) return { allow: false, message: `Blocked: main is queue-only once contracts are locked. Push your branch and open a PR labeled "queue": git push -u origin HEAD && gh pr create --fill --label queue. Override (logged): ${cli} override @push --reason "<why>".` };
  }
  return ALLOW;
}

/** git pre-commit backstop: same rules on staged files. Returns exit code. */
export async function guardStaged(root: string, binding: Binding | undefined, branch: string | undefined): Promise<number> {
  const map = await loadMap(root);
  if (!map) return 0;
  const r = git(root, "diff", "--cached", "--name-only", "-z");
  const ovr = readOverrides(root);
  let blocked = 0;
  for (const f of r.stdout.split("\0").filter(Boolean)) {
    const d = decideEdit(root, map, binding, branch, ovr, f);
    if (!d.allow) { blocked++; process.stderr.write(d.message + "\n"); }
  }
  return blocked ? 1 : 0;
}
