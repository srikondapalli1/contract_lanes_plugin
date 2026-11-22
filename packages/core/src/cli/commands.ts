import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { schema as LockSchema } from "../contracts/LockFile.ts";
import { loadConfig, writeOwnership, type LanesConfig } from "../config/index.ts";
import { formatReport, runCheck } from "../check/index.ts";
import { CONFIG_FILE, LOCK_FILE, findRoot, readJson, writeJson, writeText } from "../util/fs.ts";
import { expandBraces } from "../util/glob.ts";
import { currentBranch, git, run } from "../util/git.ts";
import { satisfies } from "../util/semver.ts";
import { addOverrides, cliCommand, readBinding, readOverrides, selfBin, VERSION_STR, writeBinding } from "../util/local.ts";
import * as T from "./templates.ts";

const need = (cwd: string) => {
  const root = findRoot(cwd);
  if (!root) throw new UsageError(`no ${CONFIG_FILE} here or above; run \`lanes init\` first`);
  return root;
};
export class UsageError extends Error {}

const writeIfMissing = (root: string, file: string, text: string, created: string[]) => {
  if (existsSync(join(root, file))) return;
  writeText(join(root, file), text);
  created.push(file);
};

export async function init(cwd: string, o: { laptops?: number; sessions?: number; hours?: number; lanes?: string; yes?: boolean; owner?: string; pkg?: string }) {
  const root = resolve(cwd);
  if (existsSync(join(root, CONFIG_FILE))) throw new UsageError(`${CONFIG_FILE} already exists; edit it, or run \`lanes doctor\``);
  let { laptops = 1, sessions = 2, hours } = o;
  if (process.stdin.isTTY && !o.yes && o.laptops === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q: string, d: number) => Number((await rl.question(`${q} [${d}] `)).trim() || d) || d;
    console.log("Planning: how much parallel capacity do you have? (2–6 lanes is the sweet spot; 3 for a hackathon)");
    laptops = await ask("Laptops?", laptops);
    sessions = await ask("Agent sessions per laptop?", sessions);
    hours = await ask("Hours available?", hours ?? 8);
    rl.close();
  }
  if (git(root, "rev-parse", "--git-dir").code !== 0) git(root, "init", "-q", "-b", "main");
  const ghUser = o.owner ?? (run(process.env.LANES_GH ?? "gh", ["api", "user", "--jq", ".login"]).stdout.trim() || "you");
  const owner = `@${ghUser.replace(/^@/, "")}`;
  const names = (o.lanes ?? "server,app").split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length < 2) throw new UsageError("--lanes needs at least two lane names, e.g. --lanes server,app");
  const starter = !o.lanes;
  const pathOf = (l: string, i: number) => (starter ? (i === 1 ? "src" : l) : l);
  const cfg = {
    lanes_version: `^${VERSION_STR}`,
    approvers: [owner],
    capacity: { laptops, sessions_per_laptop: sessions, ...(hours !== undefined ? { hours } : {}) },
    settings: { autopilot: true, stop_gate: false, fix_size_cap: 200, fix_attempts: 2, lease_minutes: 30, property_runs: 200, watch_interval_sec: 20 },
    lanes: Object.fromEntries(names.map((l, i) => [l, { owner, paths: [`${pathOf(l, i)}/**`] }])),
    contracts: { Example: { producer: names[0], consumers: [names[1]] } },
  };
  const created: string[] = [];
  writeText(join(root, CONFIG_FILE), configYaml(cfg));
  created.push(CONFIG_FILE);
  const consumerDir = pathOf(names[1], 1);
  writeIfMissing(root, "contracts/Example.ts", T.exampleContract, created);
  writeIfMissing(root, "fixtures/Example/valid/basic.json", T.exampleValid, created);
  writeIfMissing(root, "fixtures/Example/invalid/missing-id.json", T.exampleInvalid, created);
  writeIfMissing(root, `${consumerDir}/example.ts`, T.consumerCode("../contracts/Example"), created);
  writeIfMissing(root, `${consumerDir}/__contracts__/Example.test.ts`, T.consumerTest("../../contracts/Example", "../example"), created);
  writeIfMissing(root, "vitest.config.ts", T.vitestConfig, created);
  writeIfMissing(root, "tsconfig.json", T.tsconfig, created);
  writeIfMissing(root, ".github/workflows/lanes.yml", T.workflow, created);
  const pkgFile = join(root, "package.json");
  const pkg = readJson(pkgFile) ?? { name: basename(root).toLowerCase().replace(/[^a-z0-9-]/g, "-"), private: true, type: "module" };
  pkg.scripts = { check: "lanes check", ...pkg.scripts };
  // not on npm yet: default to the GitHub repo (the package root ships the built bundle); switch to `^${VERSION_STR}` once published
  const spec = o.pkg ?? process.env.LANES_PKG ?? "github:srikondapalli1/contract_lanes_plugin";
  pkg.devDependencies = { "contract-lanes": spec, vitest: "^5.1.0", zod: "^4.1.0", ...pkg.devDependencies };
  writeJson(pkgFile, pkg);
  created.push("package.json");
  const gi = join(root, ".gitignore");
  const ignore = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  const add = [".lanes/", "node_modules/"].filter((l) => !ignore.split("\n").includes(l));
  if (add.length) appendFileSync(gi, `${ignore && !ignore.endsWith("\n") ? "\n" : ""}${add.join("\n")}\n`);
  const agents = join(root, "AGENTS.md");
  const agentsText = existsSync(agents) ? readFileSync(agents, "utf8") : "";
  if (!agentsText.includes("<!-- lanes:agents -->")) appendFileSync(agents, `${agentsText ? "\n" : "# Agent instructions\n\n"}${T.agentsSection}`);
  const loaded = loadConfig(root);
  writeCodeowners(root, loaded.cfg!);
  installGitHooks(root);
  return { root, created, owner, warnings: loaded.warnings };
}

/** lanes.yaml in the SPEC's layout: one flow-style line per lane/contract (JSON is valid YAML flow). */
function configYaml(cfg: Record<string, any>): string {
  const j = (v: unknown) => JSON.stringify(v).replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "');
  const block = (k: string, o: Record<string, unknown>) => `${k}:\n${Object.entries(o).map(([n, v]) => `  ${n}: ${j(v)}`).join("\n")}`;
  return [
    "# Lanes config. Every file belongs to exactly one lane; lanes talk only through contracts.",
    `lanes_version: ${j(cfg.lanes_version)}       # every machine must match`,
    `approvers: ${j(cfg.approvers)}            # lock, major changes, cross-lane overrides`,
    `capacity: ${j(cfg.capacity)}`,
    block("settings", cfg.settings), block("lanes", cfg.lanes), block("contracts", cfg.contracts), "",
  ].join("\n");
}

export function installGitHooks(root: string): string | undefined {
  const r = git(root, "rev-parse", "--git-path", "hooks");
  if (r.code !== 0) return undefined;
  const dir = resolve(root, r.stdout.trim());
  const self = selfBin() ?? "";
  for (const kind of ["pre-commit", "prepare-commit-msg"] as const) {
    const f = join(dir, kind);
    if (existsSync(f) && !readFileSync(f, "utf8").includes("lanes")) { console.error(`lanes: ${f} exists and isn't ours; add \`lanes guard --staged\` to it yourself`); continue; }
    writeText(f, T.gitHook(kind, self));
    chmodSync(f, 0o755);
  }
  return dir;
}

export function writeCodeowners(root: string, cfg: LanesConfig) {
  const lines = ["# generated by `lanes codeowners` from lanes.yaml; edit lanes.yaml instead", `/${CONFIG_FILE} ${cfg.approvers.join(" ")}`, `/${LOCK_FILE} ${cfg.approvers.join(" ")}`];
  for (const [, def] of Object.entries(cfg.lanes)) for (const g of def.paths.flatMap(expandBraces)) lines.push(`/${g} ${def.owner}`);
  const { contracts_dir: cd, fixtures_dir: fd } = cfg.settings;
  for (const [c, def] of Object.entries(cfg.contracts)) {
    const o = cfg.lanes[def.producer]?.owner;
    if (o) lines.push(`/${cd}/${c}.ts ${o}`, `/${fd}/${c}/ ${o}`);
  }
  writeText(join(root, ".github", "CODEOWNERS"), lines.join("\n") + "\n");
}

export function join_(cwd: string, lane: string | undefined) {
  const root = need(cwd);
  const { cfg, errors } = loadConfig(root);
  if (!cfg) throw new UsageError(errors[0]);
  if (!lane || !cfg.lanes[lane]) throw new UsageError(`pick a lane: lanes join <${Object.keys(cfg.lanes).join("|")}>`);
  writeBinding(root, { v: 1, lane, boundAt: Date.now() });
  writeOwnership(root, cfg);
  installGitHooks(root);
  const produces = Object.entries(cfg.contracts).filter(([, d]) => d.producer === lane).map(([n]) => n);
  const consumes = Object.entries(cfg.contracts).filter(([, d]) => d.consumers.includes(lane)).map(([n]) => n);
  return `Joined lane "${lane}" (owner ${cfg.lanes[lane].owner}).\nYou own: ${cfg.lanes[lane].paths.join(", ")}${produces.length ? ` + contracts/fixtures of ${produces.join(", ")}` : ""}\nProduces: ${produces.join(", ") || "none"} · Consumes: ${consumes.join(", ") || "none"}\nNext: ${cliCommand(root)} check --lane ${lane}`;
}

export async function lock(cwd: string, allowOpen = 0) {
  const root = need(cwd);
  const r = await runCheck({ cwd: root, ignoreLock: true, skipOwnership: true });
  if (r.exit === 2) return { exit: 2, text: formatReport(r.report, 2) };
  if (r.report.failures.length) return { exit: 1, text: `${formatReport(r.report, 1)}\n\nlanes lock refuses: ${r.report.failures.length} failure(s). Fix them, then lock.` };
  const open = r.report.edges.filter((e) => e.status === "pending" || e.status === "untested");
  if (open.length > allowOpen) return { exit: 1, text: `${formatReport(r.report, 0)}\n\nlanes lock refuses: ${open.length} edge(s) are pending/untested (${open.map((e) => `${e.contract} ${e.producer}→${e.consumer}`).join(", ")}). Add consumer tests, or pass --allow-open ${open.length}.` };
  const lockFile = LockSchema.parse({ v: 1, lockedAt: Date.now(), lanes_version: r.cfg!.lanes_version, contracts: Object.fromEntries([...r.lockEntries].sort(([a], [b]) => a.localeCompare(b))) });
  writeJson(join(root, LOCK_FILE), lockFile);
  writeOwnership(root, r.cfg!);
  return { exit: 0, text: `Locked ${r.lockEntries.size} contract(s) → ${LOCK_FILE}. Setup phase is over: main is queue-only, and locked files change only on contract/* branches.\nCommit it: git add ${LOCK_FILE} && git commit -m "lanes: lock contracts"` };
}

export function override(cwd: string, paths: string[], reason: string | undefined, push: boolean) {
  const root = need(cwd);
  if (!reason) throw new UsageError(`overrides are logged: lanes override <path...> --reason "<why>"`);
  const all = [...paths.map((p) => p.replace(/^\.\//, "")), ...(push ? ["@push"] : [])];
  if (!all.length) throw new UsageError("name the path(s) to override, or --push");
  addOverrides(root, all, reason);
  return `Override active for 30 minutes: ${all.join(", ")}\nReason: ${reason}\nIt is logged: commits get a "Lanes-Override:" trailer and the PR comment lists it. Crossing into another lane still needs that owner's review before the queue merges.`;
}

/** prepare-commit-msg: append Lanes-Override trailers for staged overridden files. */
export function trailers(root: string, msgFile: string) {
  const ovr = readOverrides(root);
  if (!ovr.length || !msgFile) return;
  const staged = git(root, "diff", "--cached", "--name-only", "-z").stdout.split("\0").filter(Boolean);
  const hits = ovr.filter((o) => staged.some((f) => f === o.path || f.startsWith(o.path.replace(/\*+$/, ""))));
  if (!hits.length) return;
  const msg = readFileSync(msgFile, "utf8");
  const add = hits.map((o) => `Lanes-Override: ${o.path} | ${o.reason.replace(/\n/g, " ")}`).filter((t) => !msg.includes(t));
  if (add.length) writeFileSync(msgFile, `${msg.replace(/\s*$/, "")}\n\n${add.join("\n")}\n`);
}

export async function doctor(cwd: string) {
  const out: string[] = [];
  let bad = 0;
  const ok = (m: string) => out.push(`✓ ${m}`);
  const warn = (m: string, fix: string) => out.push(`⚠ ${m}\n    fix: ${fix}`);
  const fail = (m: string, fix: string) => { bad++; out.push(`✗ ${m}\n    fix: ${fix}`); };
  const major = Number(process.versions.node.split(".")[0]);
  major >= 20 ? ok(`node ${process.versions.node}`) : fail(`node ${process.versions.node} is too old`, "install Node 20 or newer");
  const root = findRoot(cwd);
  if (!root) { fail(`no ${CONFIG_FILE}`, "run `lanes init` (or /lanes:init) in your repo"); return { exit: 1, text: out.join("\n") }; }
  git(root, "rev-parse", "--git-dir").code === 0 ? ok("git repository") : fail("not a git repository", "git init -b main");
  const { cfg, errors } = loadConfig(root);
  if (!cfg) { fail(`lanes.yaml invalid: ${errors[0]}`, "fix lanes.yaml, then rerun lanes doctor"); return { exit: 1, text: out.join("\n") }; }
  errors.length ? fail(`lanes.yaml: ${errors.join("; ")}`, "fix lanes.yaml") : ok(`lanes.yaml: ${Object.keys(cfg.lanes).length} lanes, ${Object.keys(cfg.contracts).length} contracts`);
  satisfies(VERSION_STR, cfg.lanes_version) ? ok(`CLI ${VERSION_STR} satisfies lanes_version ${cfg.lanes_version}`) : fail(`CLI ${VERSION_STR} does not satisfy lanes_version ${cfg.lanes_version}`, "update the plugin (/plugin update lanes) and `npm i -D contract-lanes@latest`, or change lanes_version");
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    const pv = readJson(join(pluginRoot, ".claude-plugin", "plugin.json"))?.version;
    pv && !satisfies(pv, cfg.lanes_version) ? fail(`plugin ${pv} does not satisfy ${cfg.lanes_version}`, "/plugin update lanes") : ok(`plugin ${pv ?? "?"}`);
  }
  const req = createRequire(join(root, "package.json"));
  for (const dep of ["vitest", "zod", "contract-lanes"]) {
    try { ok(`${dep} ${req(req.resolve(`${dep}/package.json`)).version}`); } catch { fail(`${dep} is not installed`, "npm i -D vitest zod contract-lanes (or pnpm add -D …)"); }
  }
  const vc = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"].find((f) => existsSync(join(root, f)));
  if (vc && !readFileSync(join(root, vc), "utf8").includes("contract-lanes")) warn(`${vc} does not inline contract-lanes`, `add test.server.deps.inline: ["contract-lanes"] so schemaOf()/arbitraryOf() work under plain vitest`);
  const hooks = git(root, "rev-parse", "--git-path", "hooks/pre-commit");
  const hook = hooks.code === 0 ? resolve(root, hooks.stdout.trim()) : "";
  hook && existsSync(hook) && readFileSync(hook, "utf8").includes("lanes") ? ok("git pre-commit guard installed") : fail("git pre-commit guard missing", "lanes join <lane> (installs it)");
  const b = readBinding(root);
  b && cfg.lanes[b.lane] ? ok(`bound to lane "${b.lane}"`) : warn("this worktree is not bound to a lane", `lanes join <${Object.keys(cfg.lanes).join("|")}>`);
  existsSync(join(root, ".github/workflows/lanes.yml")) ? ok("workflow .github/workflows/lanes.yml") : fail("workflow missing", "copy it from `lanes init` in an empty dir, or reinstall");
  existsSync(join(root, LOCK_FILE)) ? ok(`${LOCK_FILE} present (queue-only)`) : warn("setup phase: no contracts.lock yet", "lanes lock once lanes check is green");
  const { doctorGitHub } = await import("../github/index.ts");
  const gh = await doctorGitHub(root, cfg);
  for (const g of gh) g.level === "ok" ? ok(g.msg) : g.level === "warn" ? warn(g.msg, g.fix!) : fail(g.msg, g.fix!);
  return { exit: bad ? 1 : 0, text: out.join("\n") + `\n\n${bad ? `${bad} problem(s) found.` : "All good."}` };
}

export const currentLane = (root: string) => readBinding(root)?.lane;
export { currentBranch };
