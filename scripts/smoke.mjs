#!/usr/bin/env node
// Install smoke test: what a new user does, in a fresh project, with a real package manager.
//   node scripts/smoke.mjs --pm npm|pnpm|yarn|yarn4|bun [--linker pnp|node-modules] [--spec contract-lanes@0.1.1 | --spec ./contract-lanes-0.1.1.tgz] [--type module|commonjs]
//     [--extra '{"dependencies":{"zod":"^3.25.0"}}']   (merged into the starting package.json: an existing project)
// Steps: init → install → check green → a bad fixture makes check exit 1 → join → the guard blocks a cross-lane edit
// and allows an in-lane one → graph data → doctor. The project folder name has a space in it on purpose. Runs on Linux,
// macOS and Windows; CI runs it in .github/workflows/compat.yml.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const pm = arg("pm", "npm");
const type = arg("type", "module");
let spec = arg("spec", "contract-lanes@latest");
const isFile = /\.tgz$/.test(spec);
// npx caches by spec, so each run gets its own copy of a local tarball
if (isFile) { const copy = join(tmpdir(), `contract-lanes-smoke-${pm}-${Date.now()}.tgz`); copyFileSync(resolve(spec), copy); spec = copy; }
const extra = JSON.parse(arg("extra", "{}"));
const linker = arg("linker", "pnp"); // yarn4 only
const win = process.platform === "win32";
const q = (s) => (win && /[\s&()^]/.test(s) ? `"${s}"` : s);

const dir = mkdtempSync(join(tmpdir(), `lanes smoke ${pm} `));
let failed = 0;
const run = (cmd, args, input) => {
  const t = Date.now();
  // shell on Windows so npx.cmd / pnpm.cmd / yarn.cmd resolve; args are quoted by hand there
  const r = spawnSync(win ? q(cmd) : cmd, win ? args.map(q) : args, { cwd: dir, input, encoding: "utf8", shell: win, env: { ...process.env, CI: "1", NO_COLOR: "1", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", YARN_ENABLE_IMMUTABLE_INSTALLS: "false" }, timeout: 600_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`, ms: Date.now() - t };
};
const step = (name, r, ok) => {
  const pass = ok(r);
  console.log(`${pass ? "ok  " : "FAIL"} ${name} (exit ${r.code}, ${r.ms} ms)`);
  if (!pass) { failed++; console.log(r.out.split("\n").slice(-25).map((l) => `     ${l}`).join("\n")); }
  return pass;
};
const lanes = (args, input) => ({
  npm: () => run("npx", ["--no-install", "lanes", ...args], input),
  pnpm: () => run("pnpm", ["exec", "lanes", ...args], input),
  yarn: () => run("yarn", ["-s", "lanes", ...args], input),
  yarn4: () => run("corepack", ["yarn", "lanes", ...args], input),
  bun: () => run("bun", ["run", "lanes", ...args], input),
})[pm]();

console.log(`smoke: ${pm}${pm === "yarn4" ? ` (${linker})` : ""} · ${type}${arg("extra") ? ` · ${arg("extra")}` : ""} · node ${process.version} · ${process.platform} · ${spec}\n      ${dir}`);
run("git", ["init", "-q"]);
run("git", ["config", "user.email", "smoke@example.com"]);
run("git", ["config", "user.name", "smoke"]);
writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lanes-smoke", version: "0.0.0", private: true, type, ...(pm === "yarn4" ? { packageManager: "yarn@4.9.2" } : {}), ...extra }, null, 2));
if (pm === "yarn4") writeFileSync(join(dir, ".yarnrc.yml"), `nodeLinker: ${linker}\nenableTelemetry: false\n`);

// 1. init, the way the README says (npx), pointing the devDependency at the spec under test
const initArgs = isFile ? ["--yes", "--package", spec, "lanes", "init", "--yes", "--owner", "smoke", "--pkg", `file:${spec}`]
  : ["--yes", spec, "init", "--yes", "--owner", "smoke"];
if (!step("init", run("npx", initArgs), (r) => r.code === 0 && existsSync(join(dir, "lanes.yaml")))) process.exit(1);
const written = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).devDependencies?.["contract-lanes"] ?? "";
step(`init writes the ${isFile ? "tarball" : "npm"} spec (${written})`, { code: 0, out: written, ms: 0 }, () => (isFile ? written.startsWith("file:") : written.startsWith("^")));

// 2. install with the package manager under test
const install = { npm: ["npm", ["install", "--no-audit", "--no-fund"]], pnpm: ["pnpm", ["install"]], yarn: ["yarn", ["install", "--non-interactive"]], yarn4: ["corepack", ["yarn", "install"]], bun: ["bun", ["install"]] }[pm];
if (!step(`${pm} install`, run(...install), (r) => r.code === 0)) process.exit(1);

// 3. the first check is green
const json = (r) => { try { return JSON.parse(r.out.slice(r.out.indexOf("{"), r.out.lastIndexOf("}") + 1)); } catch { return undefined; } };
step("check is green", lanes(["check", "--json"]), (r) => r.code === 0 && json(r)?.summary?.pass === 1);

// 4. a bad fixture (priority 9 > max 5) makes it red, with exit 1
const bad = join(dir, "fixtures/Example/valid/bad.json");
writeFileSync(bad, JSON.stringify({ id: "t-1", title: "x", done: false, priority: 9 }));
step("bad fixture fails with exit 1", lanes(["check", "--json"]), (r) => r.code === 1 && json(r)?.summary?.fail === 1);
writeFileSync(bad, JSON.stringify({ id: "t-1", title: "x", done: false, priority: 3 }));

// 5. bind this session to the app lane; the guard blocks server/ and allows src/ (native path separators)
step("join app", lanes(["join", "app"]), (r) => r.code === 0);
const edit = (p) => JSON.stringify({ cwd: dir, tool_name: "Edit", tool_input: { file_path: join(dir, ...p) } });
step("guard blocks a cross-lane edit", lanes(["hook", "guard"], edit(["server", "api.ts"])), (r) => r.code === 2 && /server/.test(r.out));
step("guard allows an in-lane edit", lanes(["hook", "guard"], edit(["src", "example.ts"])), (r) => r.code === 0);

// 6. the git pre-commit hook enforces the same rule outside Claude Code (on Windows it runs under Git's sh)
run("git", ["add", "-A"]);
run("git", ["commit", "-qm", "base", "--no-verify"]);
mkdirSync(join(dir, "server"), { recursive: true });
writeFileSync(join(dir, "server", "new.ts"), "export const z = 1;\n");
run("git", ["add", "server/new.ts"]);
step("pre-commit hook blocks a cross-lane commit", run("git", ["commit", "-m", "cross-lane"]), (r) => r.code !== 0 && /Blocked: server\/new\.ts/.test(r.out));
run("git", ["reset", "-q"]);
writeFileSync(join(dir, "src", "ok.ts"), "export const y = 1;\n");
run("git", ["add", "src/ok.ts"]);
step("pre-commit hook allows an in-lane commit", run("git", ["commit", "-m", "in-lane"]), (r) => r.code === 0);

// 7. graph data and doctor run without crashing (doctor may warn: no gh login in CI)
step("graph data", lanes(["graph", "--no-serve"]), (r) => r.code === 0 && existsSync(join(dir, ".lanes")));
step("doctor runs", lanes(["doctor"]), (r) => (r.code === 0 || r.code === 1) && !/\n\s+at .+:\d+:\d+/.test(r.out) && /lane/.test(r.out));

console.log(failed ? `\nsmoke: ${failed} step(s) failed` : "\nsmoke: all steps passed");
process.exit(failed ? 1 : 0);
