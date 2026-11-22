// Shared helpers for the contract-lanes benchmarks. Plain Node, no deps beyond bench/package.json.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const BENCH = dirname(new URL(import.meta.url).pathname);
export const REPO = resolve(BENCH, "..");
export const EXAMPLE = join(REPO, "examples/three-lanes");
export const RESULTS = join(BENCH, "results");
/** The lanes CLI under test. Override with LANES_BIN=/path/to/lanes.mjs (e.g. a frozen snapshot). */
export const LANES_BIN = process.env.LANES_BIN ? resolve(process.env.LANES_BIN) : join(REPO, "plugin/bin/lanes.mjs");
export const LANES_BIN_DIR = dirname(LANES_BIN);
export const WORK = process.env.BENCH_TMP ? resolve(process.env.BENCH_TMP) : realpathSync(tmpdir());

const require = createRequire(import.meta.url);

// ---------- tokens ----------
let _claude, _cl100k;
/** Approximate tokens. Primary: @anthropic-ai/tokenizer (legacy Claude BPE; current Claude models differ). */
export function tokens(text) {
  _claude ??= require("@anthropic-ai/tokenizer").countTokens;
  return _claude(text);
}
export function tokensCl100k(text) {
  _cl100k ??= require("js-tiktoken").getEncoding("cl100k_base");
  return _cl100k.encode(text).length;
}
export const TOKENIZER = "approximate tokens (@anthropic-ai/tokenizer 0.0.4, legacy Claude BPE; cross-checked with js-tiktoken cl100k_base)";
export const measure = (text) => ({ chars: text.length, tokens: tokens(text), tokens_cl100k: tokensCl100k(text), chars_div_4: Math.ceil(text.length / 4) });

// ---------- processes ----------
export function sh(cmd, args, cwd, { env = {}, input, timeout = 600_000 } = {}) {
  const t = performance.now();
  const r = spawnSync(cmd, args, { cwd, input, encoding: "utf8", timeout, maxBuffer: 64 << 20, env: { ...process.env, ...env } });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: performance.now() - t };
}
export const lanes = (cwd, args, opts) => sh(process.execPath, [LANES_BIN, ...args], cwd, opts);
export const git = (cwd, ...a) => {
  const r = sh("git", ["-c", "user.name=bench", "-c", "user.email=bench@example.com", ...a], cwd);
  if (r.code) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
export const tmp = (name) => realpathSync(mkdtempSync(join(WORK, `lanes-bench-${name}-`)));

// ---------- example repo ----------
/** A package dir that resolves `contract-lanes/test` to the CLI under test (so a frozen LANES_BIN is used end to end). */
let _pkg;
function contractLanesPkg() {
  if (LANES_BIN === join(REPO, "plugin/bin/lanes.mjs")) return REPO;
  if (_pkg) return _pkg;
  _pkg = tmp("pkg");
  const meta = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  writeFileSync(join(_pkg, "package.json"), JSON.stringify({ name: meta.name, version: meta.version, type: "module", exports: meta.exports, bin: meta.bin }, null, 2));
  mkdirSync(join(_pkg, "plugin"));
  symlinkSync(LANES_BIN_DIR, join(_pkg, "plugin", "bin"), "dir");
  return _pkg;
}

/** Simulate `npm i -D contract-lanes vitest zod` by symlinking the repo's installs (same as packages/core/test/helpers.ts). */
export function linkDeps(dir) {
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  for (const d of ["zod", "vitest", "typescript"]) symlinkSync(realpathSync(join(REPO, "node_modules", d)), join(dir, "node_modules", d), "dir");
  symlinkSync(contractLanesPkg(), join(dir, "node_modules", "contract-lanes"), "dir");
  symlinkSync(LANES_BIN, join(dir, "node_modules", ".bin", "lanes"));
}

/** Copy examples/three-lanes into a fresh git repo. `edit(dir)` may mutate files before the initial commit. */
export function exampleRepo(name, edit) {
  const dir = tmp(name);
  cpSync(EXAMPLE, dir, { recursive: true, filter: (src) => !/[\\/](node_modules|\.lanes)([\\/]|$)/.test(src) });
  linkDeps(dir);
  if (edit) edit(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
  return dir;
}

export function replaceIn(file, from, to) {
  const src = readFileSync(file, "utf8");
  if (!src.includes(from) && !(from instanceof RegExp && from.test(src))) throw new Error(`replaceIn: pattern not found in ${file}: ${from}`);
  writeFileSync(file, src.replace(from, to));
}

// ---------- stats ----------
export const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
export const summary = (xs) => ({ n: xs.length, min: Math.min(...xs), median: quantile(xs, 0.5), p95: quantile(xs, 0.95), max: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length });
export const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// ---------- results ----------
// Each benchmark writes results/raw/<key>.json (so scripts can run in parallel); charts.mjs merges them into results/results.json.
export function saveResult(key, value) {
  mkdirSync(join(RESULTS, "raw"), { recursive: true });
  writeFileSync(join(RESULTS, "raw", `${key}.json`), JSON.stringify({ ...value, measured_at: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}` }, null, 2) + "\n");
}
export function loadResults() {
  const dir = join(RESULTS, "raw");
  if (!existsSync(dir)) return {};
  const out = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) out[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  return out;
}
