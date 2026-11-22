import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LanesConfig } from "../contracts/LanesConfig.ts";
import { schema as LockSchema, type LockFile } from "../contracts/LockFile.ts";
import type { Failure } from "../contracts/_common.ts";
import { LOCK_FILE, readJson, sha256, stableStringify } from "../util/fs.ts";

export type LockEntry = LockFile["contracts"][string];
export interface ContractState { name: string; version: string; jsonSchema: unknown; fixtures: string[]; tests: Record<string, string[]> }

const fileHash = (root: string, f: string) => sha256(readFileSync(join(root, f)));
const setHash = (root: string, files: string[]) => sha256([...files].sort().map((f) => `${f}\0${fileHash(root, f)}\n`).join(""));

export function entryFor(root: string, c: ContractState): LockEntry {
  const fixtureFiles = Object.fromEntries([...c.fixtures].sort().map((f) => [f, fileHash(root, f)]));
  return {
    version: c.version,
    schemaHash: sha256(stableStringify(c.jsonSchema)),
    fixturesHash: setHash(root, c.fixtures),
    consumerTestsHash: Object.fromEntries(Object.entries(c.tests).sort().map(([l, fs]) => [l, setHash(root, fs)])),
    jsonSchema: c.jsonSchema,
    fixtureFiles,
  };
}

export function readLock(root: string): LockFile | undefined {
  const raw = readJson(join(root, LOCK_FILE));
  if (!raw) return undefined;
  const p = LockSchema.safeParse(raw);
  return p.success ? p.data : undefined;
}

export interface LockCompare {
  ok: boolean; changed: string[]; classification?: "minor" | "major"; reasons?: string[]; failures: Failure[]; setup: boolean;
}

export function compareLock(root: string, cfg: LanesConfig, lock: LockFile | undefined, current: Map<string, LockEntry>, branch: string | undefined, repro: string): LockCompare {
  if (!lock) return { ok: true, changed: [], failures: [], setup: true };
  const changed: string[] = [];
  const failures: Failure[] = [];
  const reasons: string[] = [];
  let level: "none" | "minor" | "major" = "none";
  const bump = (l: "minor" | "major", why: string) => { reasons.push(why); if (l === "major" || level === "none") level = l; };
  const onContractBranch = !!branch?.startsWith("contract/");
  const names = new Set([...Object.keys(lock.contracts).filter((n) => cfg.contracts[n]), ...current.keys()]);
  for (const name of [...names].sort()) {
    const old = lock.contracts[name];
    const now = current.get(name);
    if (!now) continue; // not checked this run (--lane) or failed to load
    const what: string[] = [];
    if (!old) what.push("new contract");
    else {
      if (old.schemaHash !== now.schemaHash) what.push("schema");
      if (old.fixturesHash !== now.fixturesHash) what.push("fixtures");
      for (const l of new Set([...Object.keys(old.consumerTestsHash), ...Object.keys(now.consumerTestsHash)]))
        if (old.consumerTestsHash[l] !== now.consumerTestsHash[l]) what.push(`consumer tests (${l})`);
    }
    if (!what.length) continue;
    changed.push(name);
    if (onContractBranch) classify(name, old, now, bump);
    else {
      const producer = cfg.contracts[name]?.producer ?? "approvers";
      const testLane = what.find((w) => w.startsWith("consumer tests"))?.match(/\((.+)\)/)?.[1];
      failures.push({
        check: "lock", contract: name, owner: what.every((w) => w.startsWith("consumer")) && testLane ? testLane : producer,
        message: `${name} changed since ${LOCK_FILE} (${what.join(", ")}). Locked contracts change only on a contract branch: git switch -c contract/${name}-<slug>`,
        repro: `${repro} check --lane ${producer}`,
      });
    }
  }
  for (const name of Object.keys(lock.contracts)) if (!cfg.contracts[name]) { changed.push(name); if (onContractBranch) bump("major", `${name}: contract removed`); else failures.push({ check: "lock", contract: name, owner: "approvers", message: `${name} is in ${LOCK_FILE} but no longer in lanes.yaml; removing a contract needs a contract/* branch` }); }
  return {
    ok: failures.length === 0, changed, failures, setup: false,
    ...(onContractBranch && level !== "none" ? { classification: level, reasons } : {}),
  };
}

function classify(name: string, old: LockEntry | undefined, now: LockEntry, bump: (l: "minor" | "major", why: string) => void) {
  if (!old) return bump("minor", `${name}: new contract added`);
  if (old.schemaHash !== now.schemaHash) {
    if (old.jsonSchema === undefined) bump("major", `${name}: schema changed (old lock has no JSON Schema to compare)`);
    else diffSchema(old.jsonSchema, now.jsonSchema, name, bump);
  }
  if (old.fixturesHash !== now.fixturesHash) {
    const a = old.fixtureFiles ?? {}, b = now.fixtureFiles ?? {};
    const removed = Object.keys(a).filter((f) => !(f in b));
    const edited = Object.keys(a).filter((f) => f in b && a[f] !== b[f]);
    const added = Object.keys(b).filter((f) => !(f in a));
    if (!old.fixtureFiles) bump("major", `${name}: fixtures changed`);
    removed.forEach((f) => bump("major", `${name}: fixture removed: ${f}`));
    edited.forEach((f) => bump("major", `${name}: fixture edited: ${f}`));
    added.forEach((f) => bump("minor", `${name}: fixture added: ${f}`));
  }
  for (const l of new Set([...Object.keys(old.consumerTestsHash), ...Object.keys(now.consumerTestsHash)]))
    if (old.consumerTestsHash[l] !== now.consumerTestsHash[l]) bump("minor", `${name}: consumer tests updated by ${l}`);
}

const SKIP_KEYS = new Set(["properties", "required", "$schema", "enum", "items", "description", "title"]);
function diffSchema(a: any, b: any, where: string, bump: (l: "minor" | "major", why: string) => void) {
  if (stableStringify(a) === stableStringify(b)) return;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return bump("major", `${where}: changed`);
  const rest = (o: any) => stableStringify(Object.fromEntries(Object.entries(o).filter(([k]) => !SKIP_KEYS.has(k))));
  if (rest(a) !== rest(b)) return bump("major", `${where}: ${describe(a, b)}`);
  if (a.enum || b.enum) {
    const ea: unknown[] = a.enum ?? [], eb: unknown[] = b.enum ?? [];
    const removed = ea.filter((x) => !eb.some((y) => stableStringify(y) === stableStringify(x)));
    const added = eb.filter((x) => !ea.some((y) => stableStringify(y) === stableStringify(x)));
    if (removed.length || !a.enum || !b.enum) bump("major", `${where}: enum values removed (${removed.map(String).join(", ")})`);
    if (added.length) bump("minor", `${where}: enum value added (${added.map(String).join(", ")}); warning: exhaustive consumers may break`);
  }
  if (a.items || b.items) diffSchema(a.items, b.items, `${where}[]`, bump);
  if (a.properties || b.properties) {
    const pa = a.properties ?? {}, pb = b.properties ?? {};
    const ra = new Set<string>(a.required ?? []), rb = new Set<string>(b.required ?? []);
    for (const k of Object.keys(pa)) {
      if (!(k in pb)) bump("major", `${where}.${k}: property removed`);
      else {
        if (ra.has(k) !== rb.has(k)) bump("major", `${where}.${k}: became ${rb.has(k) ? "required" : "optional"}`);
        diffSchema(pa[k], pb[k], `${where}.${k}`, bump);
      }
    }
    for (const k of Object.keys(pb)) if (!(k in pa)) bump(rb.has(k) ? "major" : "minor", `${where}.${k}: ${rb.has(k) ? "required" : "optional"} property added`);
  }
}

function describe(a: any, b: any): string {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !SKIP_KEYS.has(k) && stableStringify(a[k]) !== stableStringify(b[k]));
  return keys.map((k) => `${k} ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join(", ") || "changed";
}
