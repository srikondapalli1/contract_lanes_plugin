# Lanes benchmark report

How `contract-lanes` (Lanes) compares with the approaches a team of coding agents would otherwise use for the
same job: keeping parallel agents inside their lanes and catching broken contracts between them. Everything below
was measured by the scripts in this folder on the three-lane example (`examples/three-lanes`); see
[`README.md`](README.md) to reproduce. Raw numbers: [`results/results.json`](results/results.json).

**Environment:** Linux x64, 4 vCPU, Node 22.23.5, npm 10.9.9, vitest 4.1.12 (repo) / 5.1.1 (fresh installs), zod 4.6.7,
TypeScript 5.9.3, `@pact-foundation/pact` 17.1.4 with `pact-core` 20.2.0. Measured 2026-11-22.

| Approach | What it is here |
|---|---|
| **Lanes** | Claude Code plugin (skills, hooks, guard) + `lanes check`: fixtures, generated schema checks, fixture mutations, handler property tests (200 runs, shrinking), consumer tests. |
| **Prompt-only rules** | [`alternatives/prompt-only/CLAUDE.md`](alternatives/prompt-only/CLAUDE.md): the same ownership and contract rules as prose, always loaded, not enforced. |
| **Pact** | [`alternatives/pact/`](alternatives/pact/): a Pact V4 consumer test (world calls brain over HTTP, 3 interactions with MatchersV3 `integer`/`regex`/`eachLike`) and a provider verification of brain's real `tick` handler. |
| **zod + vitest** | The example's consumer tests plus [`alternatives/zod-vitest/tick.zod.test.ts`](alternatives/zod-vitest/tick.zod.test.ts): replay the valid fixtures through the handler and `safeParse` the output. No tooling. |
| **TypeScript only** | `tsc --noEmit --strict` over `contracts/` and `apps/` ([`alternatives/tsc/tsconfig.json`](alternatives/tsc/tsconfig.json)). |

## Bottom line

- **Bug catching.** Lanes caught **all 19** seeded producer-side bugs, on **every one of 10 seeds**. Pact caught 6,
  hand-written zod + vitest caught 8 and TypeScript caught 3. All three together caught 8. The 11 bugs that only Lanes
  caught are value-range, rare-input and crash bugs that hand-picked examples never exercised. One of them is the
  example's planted `holdMs: 1800`: Pact misses it even with a spooked-agent interaction, because `integer()` matches
  any integer.
- **The benchmark found two Lanes bugs, both fixed before these numbers were taken.** On the first run, Lanes caught
  18/19, because its generator never built arrays longer than about 10 elements, so a bug that needs 11–12 agents went
  unseen at any `property_runs`. Separately, parallel checks in one checkout could collide on shared temp files.
- **Tokens.** The Lanes plugin adds about **500 tokens** to every session (skill, agent and command descriptions plus
  the SessionStart hook). The prompt-only `CLAUDE.md` costs 608 tokens and enforces nothing. Pact still needs those
  rules for ownership, plus about 4.5K tokens of README and 1.3K of authored tests. For the same failure, the
  `lanes check` report is 321 tokens and Pact's verifier output is 1,909.
- **Waiting is free.** `lanes watch` is a script, so an idle agent spends **0 tokens/hour**. A `/loop` agent that
  re-reads a 50K context spends 3.0M tokens/hour polling every minute and 150K polling every 20 minutes.
- **Speed.** The guard hook takes **43 ms** median (p95 56 ms, budget 100 ms), which is about Node's startup time.
  A full `lanes check` takes **1.3 s**; a minimal Pact consumer + provider run takes 1.7 s.
- **Footprint.** On top of vitest alone, Lanes adds **9 MB and 4 packages**. Pact adds 33 MB and 133 packages,
  including a 17.6 MB native library.
- **Enforcement.** The guard blocked 7 of the 9 lane violations before the edit happened. The pre-commit hook caught
  the other 2 (shell writes, a limitation the spec documents). It blocked nothing it should have allowed. Prompt-only
  rules and Pact enforce none of these.

## 1. Context and token cost

Method: [`tokens.mjs`](tokens.mjs). The counts are **approximate tokens (`@anthropic-ai/tokenizer` 0.0.4, a legacy
Claude BPE)**, cross-checked with `js-tiktoken` cl100k_base, which lands within about 10% on every item. Current
Claude models tokenize differently, so read these as relative sizes. Lanes outputs come from real runs on the example
with lane `brain` bound and the planted bug present. The "same bug" rows use the `kind-typo` mutant, because every
approach catches it.

![Context cost by approach](results/tokens.svg)

| Item | Tokens | When it is paid |
|---|---:|---|
| Lanes: skill + agent + command listing (3 skills, 1 agent, 5 commands) | 410 | every session |
| Lanes: SessionStart hook (bound lane, 1 red edge with repro) | 92 | once per session |
| Lanes: UserPromptSubmit inbox, nothing new | 0 | per prompt |
| Lanes: AGENTS.md section from `lanes init` (other agents only) | 270 | every session, if the agent loads AGENTS.md |
| Prompt-only `CLAUDE.md` rules + lane/contract map | 608 | every session |
| Lanes: skills `lanes-workflow` / `lanes-contracts` / `lanes-fixer` | 1,049 / 982 / 573 | on demand |
| Lanes: `fixer` agent body | 381 | when a fix is delegated |
| Lanes: guard block message | 63 | per blocked edit |
| Lanes: `lanes watch` wake line (WatchResult) | 45 | per actionable message |
| Lanes: `lanes check` report, planted bug (human / `--lane brain` / `--json`) | 315 / 318 / 985 | per check |
| Pact JS README (npm tarball; the API an agent must learn) | 4,515 | once |
| Pact consumer + provider tests the agent must write | 842 + 458 | once (authored) |
| zod + vitest handler test the agent must write | 273 | once (authored) |
| **Same bug, failure output:** `lanes check` / `--json` | 321 / 994 | per failure |
| **Same bug, failure output:** tsc / vitest / Pact verifier | 402 / 493 / 1,909 | per failure |

### Idle polling

Agents in different lanes message each other through GitHub issues, so each approach needs some way to wait.

- **`/loop` polling:** every wake is a model turn that re-reads the context *C* and runs one poll (*p* = 79 measured
  tokens: prompt, `gh issue list`, empty result, reply). Cost: **tokens/hour = (60 / N) × (C + p)**.
- **Lanes:** `lanes watch` polls GitHub without calling the model and exits only when an actionable item arrives. The
  agent reads the WatchResult line and restarts the watcher (*w* = 71 measured tokens on top of *C*).
  Cost: **tokens/hour = E × (C + w)**, where *E* is actionable events per hour; 0 when nothing arrives.

![Idle polling tokens per hour](results/idle-polling.svg)

| Polling interval N (min) | 1 | 5 | 20 | 60 |
|---|---:|---:|---:|---:|
| `/loop`, C = 20K | 1.20M | 241K | 60K | 20K |
| `/loop`, C = 50K | 3.00M | 601K | 150K | 50K |

Lanes has no polling interval: at C = 50K it costs 0 tokens/hour idle, 50K with 1 event/hour, 200K with 4 events/hour.
The context sizes are parameters, not measurements. Prompt caching lowers the *price* of re-reading C, not the token
count. At 4 events/hour, Lanes costs about what a 15-minute `/loop` costs, but it reacts within the watcher's poll
interval (`watch_interval_sec: 20`) instead of up to 15 minutes later.

## 2. Bug-catch rate (mutation study)

Method: [`mutants.mjs`](mutants.mjs). The baseline is the example with the planted bug fixed (`holdMs: 1200`); every
approach is green on it, so there are no false positives. Each of the 19 mutants seeds one realistic bug: 16 in brain's
`tick` handler, and 3 where the producer changes its own contract or fixtures. `lanes check` and `lanes check --fast`
run seeds 1 to 10. "Caught" means the approach exits non-zero.

![Seeded bugs caught](results/bug-catch.svg)

| Approach | Caught | Rate |
|---|---:|---:|
| `lanes check` (every one of 10 seeds) | **19 / 19** | **100%** |
| `lanes check --fast` (50 property runs; ≥1 seed / every seed) | 19 / 17 | 100% / 89% |
| Pact consumer + provider verification | 6 / 19 | 32% |
| Hand-written zod + vitest (consumer tests + fixture replay) | 8 / 19 | 42% |
| TypeScript strict | 3 / 19 | 16% |
| Pact ∪ zod+vitest ∪ tsc | 8 / 19 | 42% |

Seed variance: full `lanes check` caught 19/19 on every seed. `--fast` caught 17–19 per seed; it misses the two
rarest-input bugs on some seeds (`haunt-rare` on 4 of 10, `to-no-clamp-high` on 1 of 10). Use `--fast` while
iterating; the default 200 runs catch everything here.

![Bug catch matrix](results/bug-matrix.svg)

| # | Mutant | Bug | Trigger | lanes check | --fast | Pact | zod+vitest | tsc |
|---|---|---|---|---|---|---|---|---|
| 1 | `hold-1800` | spooked holdMs 1800 (planted bug; max 1500) | any spooked agent | 10/10 | 10/10 | · | · | · |
| 2 | `hold-off-by-one` | spooked holdMs 1501 | any spooked agent | 10/10 | 10/10 | · | · | · |
| 3 | `hold-negative` | calm holdMs = 250 − 5·x | calm agent with x > 50 | 10/10 | 10/10 | · | · | · |
| 4 | `hold-float` | curious holdMs = 400 + x/2 | curious agent with odd x | 10/10 | 10/10 | · | · | · |
| 5 | `crowded-hold` | calm holdMs = 140 · agents.length | 11–12 agents | 10/10 | 10/10 | · | · | · |
| 6 | `haunt-rare` | curious holdMs 2000 if a haunt has intensity > 9 | curious + intense haunt | 10/10 | 6/10 | · | · | · |
| 7 | `to-no-clamp-high` | move forgets clamp (x = 64) | curious agent at x = 63 | 10/10 | 9/10 | · | · | · |
| 8 | `to-no-clamp-low` | flee forgets clamp (negative x/y) | spooked agent near origin | 10/10 | 10/10 | · | · | · |
| 9 | `to-float` | move x = clamp(1.5·x) | curious agent with odd x | 10/10 | 10/10 | · | · | · |
| 10 | `kind-typo` | kind "walk" (not in enum) | any curious agent | 10/10 | 10/10 | ✓ | ✓ | ✓ |
| 11 | `missing-agentId` | calm action drops agentId | any calm agent | 10/10 | 10/10 | ✓ | ✓ | ✓ |
| 12 | `agentId-format` | agentId upper-cased ("A-1") | any calm agent | 10/10 | 10/10 | ✓ | ✓ | · |
| 13 | `tick-echo` | response tick = request tick + 1 | every request | 10/10 | 10/10 | ✓ | ✓ | · |
| 14 | `drop-agent` | skips the first agent (schema-valid) | any non-empty world | 10/10 | 10/10 | ✓ | ✓ | · |
| 15 | `crash-no-haunts` | reads `req.haunts![0]` | curious agent, no haunts | 10/10 | 10/10 | · | · | · |
| 16 | `crash-empty-world` | reads `req.agents[0]` up front | empty world | 10/10 | 10/10 | ✓ | ✓ | · |
| 17 | `schema-loosened` | producer raises holdMs max to 2000 and emits 1800; world still throws > 1500 | spooked agent | 10/10 | 10/10 | · | · | · |
| 18 | `bad-valid-fixture` | producer adds a "valid" fixture with holdMs 1600 | the fixture | 10/10 | 10/10 | · | ✓ | · |
| 19 | `required-field` | schema adds required `reason`; handler never emits it | every response | 10/10 | 10/10 | · | ✓ | ✓ |

Why the alternatives miss these bugs:

- **Pact** checks the *shape* of each recorded example. Its matchers have no numeric ranges and don't flag unexpected
  keys, and a provider is only exercised on the requests the consumer wrote down. For bugs 1–2 Pact had a
  spooked-agent interaction, but `integer(1200)` also accepts 1800 and 1501. Bugs 17–19 change the schema or fixtures,
  which Pact never reads.
- **Example-based tests** (zod + vitest) validate the full schema, but only on the two hand-written requests. Neither
  has a spooked agent, an edge coordinate, an odd x, a missing `haunts` or 11+ agents.
- **TypeScript** sees only shape errors (wrong enum literal, missing or new required field). A `number` type cannot
  express 0..1500, an integer, or 0..63.

For the planted bug, Lanes shrinks the counterexample to
`{"tick":0,"worldId":" ","agents":[{"id":"a-0","at":{"x":0,"y":0},"mood":"spooked"}]}` and prints the seed and a
one-line repro. For `crowded-hold` it shrinks to exactly 11 agents.

### Rare inputs vs `property_runs`

Method: [`sensitivity.mjs`](sensitivity.mjs): detection rate over 10 seeds with `lanes check --lane brain`.

| Mutant | 50 runs | 200 runs | 1,000 runs | 5,000 runs |
|---|---:|---:|---:|---:|
| `crowded-hold` (needs 11–12 agents) | 100% | 100% | 100% | 100% |
| `haunt-rare` (curious agent + haunt intensity > 9) | 60% | 100% | 100% | 100% |
| `to-no-clamp-high` (curious agent at x = 63) | 90% | 100% | 100% | 100% |

Before the fix, `crowded-hold` was 0% at every setting: the generator called `fc.array` without `size`, and
fast-check's default size stopped around 10 elements, so a `TickRequest` with 11–12 agents (`.max(12)`) never
appeared. Arrays with an explicit max now use `size: "max"`. The trade-off: longer arrays shift the input mix, so the
rarest combinations need the default 200 runs rather than 50.

## 3. Speed

Method: [`speed.mjs`](speed.mjs), run with nothing else on the machine. Wall-clock times from Node `spawnSync`,
including process start. Hooks ran 50 times each (SessionStart 20); each check ran 7 times after one warm-up.

![Speed](results/speed.svg)

| Measurement | Median | p95 |
|---|---:|---:|
| guard: allow own-lane Edit | 43 ms | 55 ms |
| guard: block cross-lane Edit | 43 ms | 56 ms |
| guard: Bash command | 42 ms | 52 ms |
| SessionStart hook | 101 ms | 114 ms |
| `lanes --version` (Node startup floor) | 46 ms | 51 ms |
| `lanes check` (planted bug present) | 1,297 ms | 1,315 ms |
| `lanes check --fast` | 1,074 ms | 1,182 ms |
| `lanes check --lane brain` | 1,251 ms | 1,343 ms |
| `lanes check --fast --lane brain` | 1,048 ms | 1,095 ms |
| Pact consumer test + provider verification (two vitest runs) | 1,698 ms | 1,828 ms |

- Check time barely moves with `property_runs`: 1,268 ms at 50, 1,223 at 200, 1,241 at 1,000, 1,526 at 5,000.
  Process and vitest start-up dominate.
- The planted bug was caught on 20/20 seeds, median 10 shrink steps (range 7–14).
- Budgets: the guard runs at about Node's startup cost (budget 100 ms); `check --fast --lane` takes about 1 s
  (budget 20 s).

## 4. Install footprint

Method: [`install.mjs`](install.mjs): a fresh directory and an empty npm cache per run (`--prefer-online`), so times
include downloads; best of 2. `contract-lanes` isn't on the registry yet, so it was installed from an `npm pack`
tarball of this repo.

![Install footprint](results/install.svg)

| | contract-lanes + vitest + zod | @pact-foundation/pact 17.1.4 + vitest | vitest alone |
|---|---:|---:|---:|
| node_modules size | 49.0 MB | 73.1 MB | 40.0 MB |
| Installed packages | 39 | 168 | 35 |
| Install time (cold cache) | 8.0 s | 11.3 s | 7.9 s |
| Added on top of vitest | **+9.0 MB, +4 packages** | +33.1 MB, +133 packages | |
| Native binaries beyond vitest's own | none | `libpact_ffi.so` 17.6 MB + `node.napi.node` 0.3 MB | |

The `contract-lanes` tarball is 281 KB (1.2 MB unpacked, 35 files). Its only runtime dependency is `fast-check`
(the CLI is a self-contained bundle; the dependency provides types for `contract-lanes/test`). `zod` and `vitest` are
peers. Pact's package depends on `pact-core`, which ships one native package per platform.

## 5. Setup an agent must author (world ⇄ brain edge)

Method: [`setup-size.mjs`](setup-size.mjs): non-blank lines and approximate tokens of the files an agent writes for
the TickRequest/TickResponse edge.

| Approach | Files | Lines | Tokens | What it buys |
|---|---:|---:|---:|---|
| Lanes | 12 | 92 | 1,422 | zod schemas, 6 fixtures, 2 consumer tests and `lanes.yaml` (covers all 3 contracts). Property tests, mutations, the guard, messaging and the merge queue come from the tool. |
| zod + vitest | 13 | 120 | 2,017 | The same schemas, fixtures and tests, a hand-written handler test and `CLAUDE.md` rules. Nothing enforced. |
| Pact | 3 | 114 | 1,910 | A consumer test, an HTTP provider verification and `CLAUDE.md` rules. No schemas. Haunt would also need a message pact (not written). |
| Prompt-only | 1 | 34 | 608 | Rules only. |

## 6. Ownership enforcement

Method: [`guard-scenarios.mjs`](guard-scenarios.mjs). The agent is bound to lane `brain`. Each scenario goes to
`lanes hook guard` as Claude Code PreToolUse JSON; each file write is also staged in a fresh copy and run through
`lanes guard --staged` (the git pre-commit layer).

| Scenario | PreToolUse guard | pre-commit | Prompt-only / Pact |
|---|---|---|---|
| Edit own lane file | allow | allow | allow |
| Edit / add the contract and fixtures brain produces | allow | allow | allow |
| Edit another lane's file | **block** | **block** | allowed (relies on the model) |
| Write a new file in another lane | **block** | **block** | allowed |
| Edit a contract brain only consumes (TickRequest) | **block** | **block** | allowed |
| Add a fixture for a consumed contract | **block** | **block** | allowed |
| `sed -i` on another lane's file (Bash) | allow (documented limitation) | **block** | allowed |
| `echo > apps/world/...` (Bash) | allow (documented limitation) | **block** | allowed |
| `git push --force` | **block** | n/a | allowed |
| `git push origin main`, setup phase (no `contracts.lock`) | allow (by design) | n/a | allowed |
| `git push origin main` after `lanes lock` | **block** | n/a | allowed |
| Edit a produced contract after `lanes lock`, on main | **block** | n/a | allowed |
| `grep` across lanes (read-only) | allow | n/a | allowed |

The block message is 63 tokens and names what to do instead (`npx lanes msg world --type request "..."`).

## Caveats and limitations

- **Small example.** 3 contracts and 1 handler binding; the bugs were written by hand to be realistic, not sampled from
  incidents. The rates show which *kinds* of bug each approach can see here, not a population rate.
- **The Pact setup is one reasonable choice.** Pact got the same examples as the Lanes fixtures plus a spooked agent,
  with idiomatic matchers. Pinning more exact values would catch more and break more often. Pact's strengths fall
  outside this benchmark: HTTP and status semantics, a broker with versioned contracts across repositories, and
  can-i-deploy.
- **Pact verifier workaround.** Here, the JS `Verifier` routed localhost through `HTTPS_PROXY` and ignored
  `NO_PROXY`, so the provider test calls `pact-core`'s `verifyPacts` directly: the same Rust verifier the JS one wraps.
- **Approximate tokens.** Offline tokenizers, not the model in use; idle polling is a model with stated parameters.
- **"Always loaded" depends on Claude Code**, which lists skills, agents and commands by description and loads bodies
  on demand.
- **Which build.** Bug-catch, sensitivity and install numbers were re-measured on the fixed build (this branch). Token,
  speed, setup and guard numbers come from the earlier snapshot; the code paths they measure didn't change.
- **Network-dependent install times**, cold cache, one machine.
