# Lanes v1: Internal contracts

These are the shapes passed between Lanes' own modules and surfaces (the CLI core, the GitHub layer, the plugin and graph). They're written as TypeScript and implemented as zod schemas in `packages/core/src/contracts/`, with fixtures in `packages/core/fixtures/<Name>/{valid,invalid}/`. **Lanes is built with its own method.**

Conventions: `EpochMs` = epoch milliseconds. Paths are repo-relative POSIX paths. Every top-level object has `v: 1`.

---

## C1. LanesConfig (`lanes.yaml`), owned by **core**

```ts
type LaneName = string;               // /^[a-z][a-z0-9-]{0,31}$/
type ContractName = string;           // /^[A-Z][A-Za-z0-9]{0,63}$/
interface LanesConfig {
  lanes_version: string;              // semver range the CLI must satisfy
  approvers: string[];                // GitHub handles, "@x"
  capacity?: { laptops: number; sessions_per_laptop: number; hours?: number };
  settings: {
    autopilot: boolean;               // default true
    stop_gate: boolean;               // default false
    fix_size_cap: number;             // default 200 (changed lines)
    fix_attempts: number;             // default 2
    lease_minutes: number;            // default 30
    property_runs: number;            // default 200
    watch_interval_sec: number;       // default 20, min 10
  };
  lanes: Record<LaneName, { owner: string; paths: string[] }>;            // globs; must not overlap
  contracts: Record<ContractName, { producer: LaneName; consumers: LaneName[] }>;
  handlers?: Record<string, { lane: LaneName; module: string;             // "path.ts#export"
                              input: ContractName; output: ContractName }>;
}
```

**Validation:**
- Every lane referenced exists.
- A producer isn't one of its own consumers.
- The handler's `lane` equals the producer of its `output` contract.
- Paths don't overlap.

Planning warnings (not errors): more lanes than `laptops × sessions_per_laptop` · a lane with no contracts · 4 or more contracts between the same two lanes.

## C2. LocalBinding (`.lanes/local.json`, gitignored, one per worktree), owned by **core**

```ts
interface LocalBinding { v: 1; lane: LaneName; boundAt: EpochMs; lastShownInbox?: EpochMs; }
```

## C3. CheckReport (`lanes check --json`, also written to `.lanes/cache/report.json`), owned by **core**

```ts
type EdgeStatus = "pass" | "fail" | "pending" | "untested";
interface Failure {
  check: "schema" | "fixture-valid" | "fixture-invalid" | "generated" | "mutation"
       | "handler-property" | "consumer-test" | "lock" | "ownership" | "config";
  contract?: ContractName;
  message: string;                    // one line, human readable
  detail?: string;                    // e.g. vitest assertion text
  file?: string;
  seed?: number;
  counterexample?: unknown;           // shrunk input (handler-property)
  repro?: string;                     // exact command to reproduce
  owner: LaneName;                    // whose fix it is
}
interface Edge {
  contract: ContractName; producer: LaneName; consumer: LaneName;
  status: EdgeStatus; version: string;
  fixtures: { valid: number; invalid: number };
  consumerTests: number;              // test count in the consumer's __contracts__ file(s)
  failures: Failure[];                // subset relevant to this edge
  pendingIssues: number[];            // open lanes:request issue numbers
}
interface CheckReport {
  v: 1; startedAt: EpochMs; durationMs: number;
  mode: "local" | "fast" | "ci"; lane?: LaneName; seed: number; commit?: string; branch?: string;
  edges: Edge[];
  failures: Failure[];                // all failures, including non-edge ones (config, ownership)
  lock: { ok: boolean; changed: ContractName[]; classification?: "minor" | "major"; reasons?: string[] };
  ownership: { lane?: LaneName; violations: { file: string; owner: LaneName }[]; overrides: { file: string; reason: string }[] };
  warnings: string[];                 // planning warnings, skipped zod types, etc.
  summary: { pass: number; fail: number; pending: number; untested: number };
}
```

**Exit code:** 0 if `summary.fail === 0` and there are no config failures · 1 on any failure · 2 on a config error.

## C4. LockFile (`contracts.lock`, committed), owned by **core**

```ts
interface LockFile {
  v: 1; lockedAt: EpochMs; lanes_version: string;
  contracts: Record<ContractName, {
    version: string;                  // VERSION export
    schemaHash: string;               // sha256 of normalized JSON Schema
    fixturesHash: string;             // sha256 over sorted fixture paths + contents
    consumerTestsHash: Record<LaneName, string>;
  }>;
}
```

## C5. IssueMeta (machine block in issues and comments: `<!-- lanes:{json} -->`), owned by **github**

```ts
interface IssueMeta {
  v: 1;
  type: "blocker" | "request" | "notice" | "control" | "handoff";
  to: LaneName | "approvers";
  from: LaneName | "ci" | "human";
  contract?: ContractName;
  key: string;                        // dedup key, e.g. "blocker:TickResponse:handler-property:9f3c"
  attempts?: number;                  // fix attempts so far
  lease?: { by: string; until: EpochMs };   // claim
  failure?: Failure;                  // for blockers (C3)
}
```

Bot comments contain `<!-- lanes:bot -->`, and watchers ignore them. Humans' comments carry no marker.

## C6. GraphData (`.lanes/cache/graph.json`), owned by **core**, read by **surface**

```ts
interface GraphData {
  v: 1; generatedAt: EpochMs; fromReport: EpochMs; repo?: string;
  nodes: { lane: LaneName; owner: string; openBlockers: number; openRequests: number; claimedFixes: number[] }[];
  edges: (Pick<Edge, "contract" | "producer" | "consumer" | "status" | "version" | "fixtures" | "consumerTests" | "pendingIssues">
          & { topFailure?: Pick<Failure, "message" | "seed" | "repro" | "owner"> })[];
  needsOwner: { issue: number; title: string; to: LaneName | "approvers" }[];
}
```

## C7. WatchResult (the single stdout line when `lanes watch` exits 0), owned by **github**

```ts
interface WatchResult {
  v: 1; lane: LaneName;
  items: { issue: number; type: "blocker" | "request"; contract?: ContractName;
           reason: "new" | "updated" | "human-comment"; autopilot: boolean }[];
  next: string;                       // the exact command to restart the watcher
}
```

## C8. FixPlan (stdout of `lanes fix <n>`; `--submit` returns FixResult), owned by **github**

```ts
interface FixPlan  { v: 1; issue: number; lane: LaneName; worktree: string; branch: string;
                     repro: string; leaseUntil: EpochMs; attempt: number }
interface FixResult { v: 1; issue: number; outcome: "queued" | "escalated" | "rejected";
                      pr?: number; reasons?: string[] }   // e.g. "diff 260 lines > cap 200", "touched locked file"
```

## C9. PrComment (markdown, one per PR, updated in place; starts with `<!-- lanes:pr -->`), owned by **github**

Sections, in this order:
1. A status line: `✅ 4 pass · ❌ 1 fail · ⏳ 1 pending · ○ 1 untested` (each with words, never only a symbol)
2. An edge table (contract, producer → consumer, status, top failure with repro)
3. Contract change: `minor` / `major` with reasons, or "none"
4. Overrides (file, reason)
5. Queue state: waiting / rebasing / checking / merged / blocked (reason)

## C10. Hook I/O (between the plugin and `lanes hook <event>`), owned by **surface**

**Inputs** are stdin JSON from Claude Code. Fields Lanes reads: `hook_event_name`, `cwd`, `session_id`, `tool_name`, `tool_input.file_path`, `tool_input.edits[].file_path`, `tool_input.command`, `stop_hook_active`. Unknown fields are ignored. **Missing fields mean allow**, so the hook never blocks because of its own bug. Errors are logged to `.lanes/cache/hook-errors.log`.

| Event | Output on allow | Output on block |
|---|---|---|
| session-start | stdout: context text (≤ 40 lines) | n/a |
| prompt | stdout: new items (≤ 15 lines), or nothing | n/a |
| guard | exit 0, no output | exit 2, stderr: teaching message (§9 format) |
| stop | exit 0 | stdout: `{"decision":"block","reason":"<lane> is red: <top failure>; run <repro>"}` |

**Fixture sets** for each hook (stdin JSON → expected exit code, stdout and stderr) live in `packages/core/fixtures/HookIO/`. The plugin is tested against them without starting Claude Code.
