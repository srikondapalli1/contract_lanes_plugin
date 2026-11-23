import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { schema as ConfigSchema, type LanesConfig } from "../contracts/LanesConfig.ts";
import { CONFIG_FILE, LOCK_FILE, cachePath, mtime, readJson, writeJson } from "../util/fs.ts";
import { expandBraces, matches, staticPrefix } from "../util/glob.ts";

export type { LanesConfig };
export interface Loaded { cfg?: LanesConfig; errors: string[]; warnings: string[] }

export function loadConfig(root: string, files: string[] = []): Loaded {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown;
  try { raw = parseYaml(readFileSync(join(root, CONFIG_FILE), "utf8")); } catch (e) {
    return { errors: [`${CONFIG_FILE}: ${(e as Error).message.split("\n")[0]}`], warnings };
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.push(`${CONFIG_FILE}: ${i.path.join(".") || "(root)"}: ${i.message}`);
    return { errors, warnings };
  }
  const cfg = parsed.data;
  const lanes = Object.keys(cfg.lanes);
  const lane = (l: string, where: string) => { if (!cfg.lanes[l]) errors.push(`${CONFIG_FILE}: ${where} references unknown lane "${l}" (lanes: ${lanes.join(", ")})`); };
  for (const [c, def] of Object.entries(cfg.contracts)) {
    lane(def.producer, `contracts.${c}.producer`);
    def.consumers.forEach((l) => lane(l, `contracts.${c}.consumers`));
    if (def.consumers.includes(def.producer)) errors.push(`${CONFIG_FILE}: contracts.${c}: producer "${def.producer}" can't also be a consumer`);
  }
  for (const [h, def] of Object.entries(cfg.handlers ?? {})) {
    lane(def.lane, `handlers.${h}.lane`);
    for (const k of ["input", "output"] as const) if (!cfg.contracts[def[k]]) errors.push(`${CONFIG_FILE}: handlers.${h}.${k} references unknown contract "${def[k]}"`);
    const out = cfg.contracts[def.output];
    if (out && out.producer !== def.lane) errors.push(`${CONFIG_FILE}: handlers.${h}: lane "${def.lane}" must be the producer of ${def.output} ("${out.producer}")`);
  }
  errors.push(...overlaps(cfg, files));
  warnings.push(...planningWarnings(cfg));
  return { cfg, errors, warnings };
}

function overlaps(cfg: LanesConfig, files: string[]): string[] {
  const out: string[] = [];
  const entries = Object.entries(cfg.lanes);
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [a, la] = entries[i];
    const [b, lb] = entries[j];
    const both = files.find((f) => matches(f, la.paths) && matches(f, lb.paths));
    const nested = la.paths.flatMap(expandBraces).some((g) => lb.paths.flatMap(expandBraces).some((h) => {
      if (!g.endsWith("/**") || !h.endsWith("/**")) return false;
      const [p, q] = [staticPrefix(g), staticPrefix(h)];
      return p.startsWith(q) || q.startsWith(p);
    }));
    if (both || nested) out.push(`${CONFIG_FILE}: lanes "${a}" and "${b}" have overlapping paths${both ? ` (both match ${both})` : ""}; every file needs exactly one owner`);
  }
  return out;
}

export function planningWarnings(cfg: LanesConfig): string[] {
  const w: string[] = [];
  const lanes = Object.keys(cfg.lanes);
  if (cfg.capacity) {
    const sessions = cfg.capacity.laptops * cfg.capacity.sessions_per_laptop;
    if (lanes.length > sessions) w.push(`planning: ${lanes.length} lanes but only ${sessions} sessions (laptops × sessions_per_laptop); some lanes will sit idle`);
  }
  const pair = new Map<string, number>();
  for (const l of lanes) {
    const touched = Object.values(cfg.contracts).some((c) => c.producer === l || c.consumers.includes(l));
    if (!touched) w.push(`planning: lane "${l}" has no contracts; it can't be checked against anyone`);
  }
  for (const c of Object.values(cfg.contracts)) for (const k of c.consumers) {
    const key = [c.producer, k].sort().join(" ↔ ");
    pair.set(key, (pair.get(key) ?? 0) + 1);
  }
  for (const [k, n] of pair) if (n >= 4) w.push(`planning: ${k} share ${n} contracts; consider merging those lanes or narrowing the interface`);
  return w;
}

// ---- ownership map (also cached for the <100 ms guard) ----

export interface OwnershipMap {
  v: 1;
  generatedAt: number;
  configMtime: number;
  lockMtime: number;
  lockPresent: boolean;
  lanes: Record<string, { owner: string; globs: string[] }>;
  locked: string[];
}

export function buildOwnership(root: string, cfg: LanesConfig): OwnershipMap {
  const { contracts_dir: cd, fixtures_dir: fd } = cfg.settings;
  const lanes: OwnershipMap["lanes"] = {};
  for (const [l, def] of Object.entries(cfg.lanes)) lanes[l] = { owner: def.owner, globs: [...def.paths] };
  for (const [c, def] of Object.entries(cfg.contracts)) lanes[def.producer]?.globs.push(`${cd}/${c}.ts`, `${fd}/${c}/**`);
  const lock = readJson(join(root, LOCK_FILE));
  const lockedNames = Object.keys(lock?.contracts ?? {});
  // consumer tests are locked per lane: only lanes whose tests the lock recorded. A lane adding the first tests for an
  // edge left open at lock time isn't blocked (the queue relocks them).
  const lockedTests = (c: string) => Object.keys(lock.contracts[c]?.consumerTestsHash ?? {})
    .flatMap((l) => (cfg.lanes[l]?.paths ?? []).flatMap(expandBraces).map((g) => `${g.replace(/\/?\*\*$/, "")}/**/__contracts__/${c}.test.*`));
  const locked = lock ? [LOCK_FILE, `${cd}/_common.ts`, ...lockedNames.flatMap((c) => [`${cd}/${c}.ts`, `${fd}/${c}/**`, ...lockedTests(c)])] : [];
  return { v: 1, generatedAt: Date.now(), configMtime: mtime(join(root, CONFIG_FILE)), lockMtime: mtime(join(root, LOCK_FILE)), lockPresent: !!lock, lanes, locked };
}

export function writeOwnership(root: string, cfg: LanesConfig): OwnershipMap {
  const map = buildOwnership(root, cfg);
  writeJson(cachePath(root, "ownership.json"), map);
  return map;
}

export function laneOf(map: Pick<OwnershipMap, "lanes">, file: string): string | undefined {
  for (const [l, def] of Object.entries(map.lanes)) if (matches(file, def.globs)) return l;
  return undefined;
}

export const TEST_RE = /(?:^|\/)__contracts__\/([A-Z][A-Za-z0-9]*)\.test\.(?:ts|mts|cts|tsx|js|mjs|jsx)$/;

export const configExists = (root: string) => existsSync(join(root, CONFIG_FILE));
