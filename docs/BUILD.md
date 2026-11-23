# Lanes v1: Building it with parallel agents

## The bootstrap problem
Lanes can't enforce its own rules until M1 exists. So:
1. **Build M1 with the hackathon-kit method:** these docs, lane ownership agreed between humans, contracts from `CONTRACTS.md`, push to `main` after `pnpm check`.
2. **As soon as M1 passes its acceptance test, turn Lanes on for its own repo:** run `lanes init` on the repo (the hand-written config becomes `lanes.yaml`), then `lanes lock`, then `/lanes:join`. M2 and M3 are built with Lanes itself. **Dogfooding is the main test.**

## Repo layout
```
packages/core/          # TypeScript CLI + library ("lanes", "lanes/test")
  src/contracts/        # zod for C1–C10
  fixtures/<C>/{valid,invalid}/
  src/{config,check,lock,guard,generate,graph,github,queue,hooks,cli}/
  web/graph.html        # single static page, inlined into the bundle
plugin/                 # Claude Code plugin (see SPEC §15)
.claude-plugin/marketplace.json
examples/three-lanes/   # sample repo used by e2e tests (world/brain/crowd, includes the planted holdMs bug)
.github/workflows/      # the project's own CI
```

Stack: TypeScript, Node ≥ 22.12, pnpm, vitest, fast-check, yaml, zod v4, esbuild (bundles the plugin binary).

## Lanes for building Lanes (3 lanes; one session each, a second session later through worktrees)

| Lane | Owns | Produces | Consumes |
|---|---|---|---|
| **core** | `packages/core/src/{config,check,lock,guard,generate,graph-data,cli}/**`, `packages/core/src/contracts/**`, the fixtures for C1–C4 and C6 | C1 LanesConfig, C2 LocalBinding, C3 CheckReport, C4 LockFile, C6 GraphData | C5 (to compute `pending`), C10 (guard logic is called by hooks) |
| **github** | `packages/core/src/{github,queue,watch,fix,status}/**`, `.github/**` templates, the fixtures for C5, C7, C8, C9 | C5 IssueMeta, C7 WatchResult, C8 FixPlan/FixResult, C9 PrComment | C1, C3, C4 |
| **surface** | `plugin/**`, `packages/core/src/hooks/**`, `packages/core/web/**`, `.claude-plugin/**`, the fixtures for C10 | C10 Hook I/O, plus the skills, agent and commands | C1, C2, C3, C6, C7 |

**Contracts with the most traffic:** C3 (core → github, surface) and C6 (core → surface). Freeze them first.

## The first 3 days of issues

**core**
1. `config`: parse and validate `lanes.yaml` (C1) with planning warnings, plus fixtures for good and bad configs
2. `generate`: zod subset → fast-check arbitraries, plus mutation generators. Unsupported types produce warnings.
3. `check`: steps 1–10 of SPEC §7, producing a CheckReport (C3) with the right exit codes
4. `lock`: hashing (C4) and lock-diff detection
5. `guard`: path → lane resolution from `.lanes/cache/ownership.json` in **under 100 ms**, plus `--staged` for the git hook
6. `init`, `join`, `graph-data` (C6)

**github**
1. `msg`: create or update issues with the C5 block, dedup by key, bot marker
2. `watch`: `gh api` polling with `since` and ETag, inbox cache, exit-on-actionable (C7). Test with recorded `gh` responses as fixtures.
3. `fix`: claim and lease, create the worktree, submit gates, escalate (C8)
4. `queue`: the stateless loop (SPEC §12) against a fake GitHub (recorded fixtures), plus the real workflow template
5. `pr-comment` (C9) and `status` with its three numbers

**surface**
1. `hooks`: session-start, prompt, guard, stop, tested against the C10 fixtures (stdin → exit code, stdout, stderr)
2. Plugin scaffold: `plugin.json`, `hooks.json`, `marketplace.json`, and the esbuild bundle → `plugin/bin/lanes.mjs`
3. The 3 skills, the `fixer` agent and the 5 commands (SPEC §15). Keep them short, about 600 lines of markdown in total.
4. `web/graph.html`: reads C6, uses text labels plus color, reloads live, and has the edge detail panel. The design reference is the mockup canvas.

## End-to-end tests (in `examples/three-lanes/`)
1. **Green first run:** `lanes init` on an empty directory, then `lanes check` → exit 0.
2. **The planted bug:** brain's `tick` handler sometimes returns `holdMs: 1800`. The check exits 1 with a C3 failure that includes the seed, a shrunk counterexample and the repro. The graph edge is red.
3. **The guard:** while bound to brain, an edit to `apps/world/x.ts` → exit 2 with the teaching message, in under 100 ms.
4. **Lock:** changing a fixture on `main` → lock failure. On `contract/Haunt-rename` → classified as major.
5. **Autonomy (M2, against a real throwaway GitHub repo):** bug pushed → nightly or queue run files a blocker → watcher exits → fixer subagent → `fix --submit` → queue merges → edge green. No human action.
6. **Conflicting PRs:** two PRs that each pass alone but conflict once combined → the second gets `queue-failed`.

## Definition of done for any issue
- Tests pass, including tests against the producer's fixtures for every contract the change consumes.
- Changed outputs still validate against their contracts.
- Budgets hold: the guard stays under 100 ms, and the line count stays within budget (CI prints the line count).
- The docs line in SPEC is updated if behavior changed.

## Kept out until v1 ships
Everything in SPEC §3. If an issue starts needing one of these, open a `needs-owner` issue instead of building it.
