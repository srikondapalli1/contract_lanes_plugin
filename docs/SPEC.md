# Lanes v1: Spec

> Contract-first parallel development for coding agents. Small tool, hard guarantees.
> Working name: **lanes**. The name is probably taken on npm, so pick a unique one before publishing.

**Read order:** `SPEC.md` (what and why) → `CONTRACTS.md` (exact data shapes between modules) → `BUILD.md` (how to build it with parallel agents).

---

## 1. What it is

Lanes lets several coding agents (and humans) build one project in parallel without breaking each other.

- **Lanes:** the project is split into lanes, each owning its own folders.
- **Contracts:** lanes talk only through **contracts**, which are zod schemas plus fixtures.
- **Checks:** every contract is checked mechanically: fixtures, consumers' tests, and generated property tests that agents can't game.
- **Enforcement:** hooks enforce lane boundaries and the contract lock *while* agents work.
- **Communication and merging:** agents talk through GitHub Issues, autonomous fixers repair breakage in isolated worktrees, and a merge queue keeps `main` green.
- **Visibility:** a live graph shows which interface is broken and who owns the fix.

It ships as **one CLI** plus **a Claude Code plugin** plus **one GitHub Action**. All three call the same code.

## 2. Principles (every design decision follows these)

1. **No model calls in the tool.** Every check is deterministic, so it's free, fast, and agents can't argue past it.
2. **The repo is the source of truth.** Plain zod, vitest, YAML and GitHub labels. Removing Lanes leaves a normal repo, so there's no lock-in.
3. **Skills advise, hooks enforce.** Rules the agent must follow are enforced in code, not only in prompts.
4. **Every block teaches.** Every refusal says why and what to do instead, and there's always a logged override.
5. **Small by budget.** The core is under about 2,500 lines of non-test code. A feature that needs a server or a model call doesn't go in v1.
6. **Green first run.** `init` produces a working example, so the very first `check` passes.

## 3. Non-goals for v1 (deferred on purpose)

The MCP server · a GitHub Pages graph · a private holdout-fixture repo · a test-count ratchet · generated fake lanes and pairwise e2e · scheduled cloud fixers as a feature (documentation only) · desktop or hosted apps · VS Code extension · `adopt` for existing repos (v1.1) · languages other than TypeScript.

## 4. Concepts

| Term | Meaning |
|---|---|
| **Lane** | A unit of ownership: a set of paths, plus the contracts it produces and consumes. Lanes aren't people or laptops. |
| **Session** | One agent instance. It *joins* a lane (`lanes join`). Several sessions can share a lane by using separate worktrees. |
| **Contract** | A zod schema in `contracts/<Name>.ts`, produced by exactly one lane |
| **Fixture** | A JSON example of a contract: `valid/` must parse, `invalid/` must fail. Owned by the producer. |
| **Consumer test** | A vitest file in the consumer's paths: `**/__contracts__/<Name>.test.ts`. It proves the consumer handles the producer's fixtures. |
| **Handler binding** | Optional. Declares that a producer function turns contract A into contract B. Lanes property-tests it with generated A inputs and checks every output against B. **This is the check agents can't fake.** |
| **Lock** | `contracts.lock`: hashes of every contract, fixture and consumer test. Locked files change only on a `contract/*` branch. |
| **Edge** | A (contract, producer, consumer) triple. Its status is `pass`, `fail`, `pending` or `untested`. |
| **Message** | A GitHub issue labeled `lanes:blocker`, `lanes:request` or `lanes:notice`, plus `lane:<recipient>` |
| **Queue** | PRs labeled `queue`. A GitHub Action merges them one at a time after re-checking them against the latest `main`. |

## 5. What a user's repo looks like after `lanes init`

```
lanes.yaml                         # lanes, owners, contracts, settings
contracts/Example.ts               # one example contract (zod)
fixtures/Example/valid/basic.json
fixtures/Example/invalid/missing-id.json
src/__contracts__/Example.test.ts  # example consumer test, passes on first run
contracts.lock                     # written by `lanes lock`
.github/workflows/lanes.yml        # PR check + merge queue + nightly fuzz
.github/CODEOWNERS                 # generated from lanes.yaml
AGENTS.md (section appended)       # rules for non-Claude agents
.lanes/                            # gitignored: local.json (lane binding), cache/, override.json
.git/hooks/pre-commit              # ownership + lock guard (backstop outside Claude Code)
```

## 6. `lanes.yaml`

The full schema is in `CONTRACTS.md` (C1).

```yaml
lanes_version: "^0.1.0"          # every machine must match; session-start warns otherwise
approvers: ["@you"]              # lock, major changes, overrides that cross lanes
settings:
  autopilot: true                # watchers may wake fixers
  stop_gate: false               # opt-in: block "done" while the lane is red
  fix_size_cap: 200              # max changed lines per autonomous fix
  fix_attempts: 2                # then escalate to needs-owner
  lease_minutes: 30
  property_runs: 200
  watch_interval_sec: 20
lanes:
  world: { owner: "@you",    paths: ["apps/world/**"] }
  brain: { owner: "@friend", paths: ["apps/brain/**"] }
  crowd: { owner: "@you",    paths: ["apps/crowd/**"] }
contracts:
  TickRequest:  { producer: world, consumers: [brain] }
  TickResponse: { producer: brain, consumers: [world] }
  Haunt:        { producer: crowd, consumers: [world, brain] }
handlers:
  tick: { lane: brain, module: "apps/brain/src/tick.ts#tick", input: TickRequest, output: TickResponse }
```

**Planning:** `lanes init` asks for capacity (laptops × sessions, plus hours) and records it as `capacity`. `check` warns about:
- more lanes than sessions
- a lane with no contracts
- two lanes sharing 4 or more contracts
- overlapping paths

Recommended size: 2–6 lanes. For a hackathon, usually 3.

## 7. Contracts and checks

### File conventions
- `contracts/<Name>.ts` exports `schema` (a zod object) and `VERSION` (semver string). Imports are limited to `zod` and `contracts/_common.ts`.
- `fixtures/<Name>/valid/*.json` and `fixtures/<Name>/invalid/*.json`. **At least 1 valid and 1 invalid** per contract.
- Consumer tests: `<consumer path>/**/__contracts__/<Name>.test.ts`. Helpers come from `lanes/test`:
  - `fixturesOf(name)` → `{ valid: T[], invalid: unknown[] }`
  - `arbitraryOf(name)` → a fast-check arbitrary
  - `schemaOf(name)`

### What `lanes check` does, in order. It stops nothing early and reports everything.
1. **Config:** parse `lanes.yaml` (C1). Validate paths, references and the planning warnings.
2. **Ownership:** report any working-tree or branch-diff file outside the current lane's paths. This step is skipped in CI, where the queue checks per PR.
3. **Schemas:** each contract module loads and exports `schema` and `VERSION`.
4. **Fixtures:** every `valid` fixture parses and every `invalid` fixture fails.
5. **Generated schema checks:** `property_runs` instances are generated from the schema and must parse. This catches impossible schemas. Mutations of valid fixtures (dropped required field, wrong type, out-of-range value) must fail.
6. **Handler property tests:** for each handler binding, generate inputs from `input`, call the handler, and validate each output against `output`. Seed: `--seed` if given, otherwise random, **always printed**. On failure, shrink to the smallest counterexample.
7. **Consumer tests:** run every `__contracts__` test with vitest's JSON reporter, and map results to edges by file name.
8. **Lock:** compare current hashes with `contracts.lock`. Outside a `contract/*` branch, any difference is a failure. On a `contract/*` branch, classify the change (§8).
9. **Edges:** compute each edge's status:
   - `fail`: any failing check above involving this contract, from either side
   - `pending`: an open `lanes:request` issue references the contract (read from the cache; skipped offline)
   - `untested`: the consumer has no test file for this contract
   - `pass`: otherwise
10. **Report:** print a human summary (or `--json`, the C3 CheckReport), write `.lanes/cache/report.json` and `.lanes/cache/graph.json` (C6).

**Flags:**
- `--lane <l>` limits checks to that lane's contracts
- `--fast` skips the consumer-test run for unchanged files and uses 50 property runs
- `--ci` runs everything, with no lane binding
- `--seed <n>`

**Exit codes:** `0` = no failures (pending and untested allowed) · `1` = failures · `2` = config error.

### Supported zod subset for generation
`object`, `string` (min, max, regex as a *filter* only), `number`/`int` (min, max), `boolean`, `enum`, `literal`, `array` (min, max), `optional`, `nullable`, `union` of literals or objects, `record` of string keys.

Anything else is skipped with a warning naming the field. It never fails silently.

## 8. Lock and contract changes

- **`lanes lock`:** runs `check`, refuses if anything fails (`--allow-open N` lets it proceed with N pending or untested edges), then writes `contracts.lock` (C4). Before the first lock the repo is in **setup phase**, where direct pushes to `main` are allowed. Locking switches on queue-only.
- **Changing a contract:** work on a branch named `contract/<Name>-<slug>`. The guard allows edits to locked files only on such branches, and still only within the editor's own lane: producers edit the schema and fixtures, consumers edit their own tests.
- **Classification**, done by `check` on `contract/*` branches by comparing old and new JSON Schema (zod's `toJSONSchema`):
  - **minor:** an optional property was added, a fixture was added, or an enum value was added (the last one with a warning that exhaustive consumers may break)
  - **major:** anything else
  - The class is written to the report and to the PR comment.
- **Merging:**
  - **Minor:** the queue relocks automatically after a green check.
  - **Major:** requires an approving review from an approver. The queue checks this through the API.
- **Breaking changes** follow **expand → migrate → contract**. This is guidance in the `lanes-contracts` skill, not tooling:
  1. Add v2 next to v1.
  2. Consumers migrate in their own PRs.
  3. Remove v1 once no consumer reads it. The graph shows "v1 still used by".

## 9. Ownership guard

| Layer | Where | Blocks |
|---|---|---|
| **Claude Code hook** (PreToolUse on Edit, Write, MultiEdit, NotebookEdit) | `lanes hook guard` | Edits outside the lane's paths, and edits to locked files off a `contract/*` branch |
| **Claude Code hook** (PreToolUse on Bash) | `lanes hook guard` | `git push` to `main`, force-pushes, `git push` while red is optional. **Limitation:** shell commands that write files (sed, echo >) aren't caught here. The git hook catches them. |
| **git pre-commit** | `lanes guard --staged` | The same rules on staged files, for any tool or human |
| **Queue** | CI | Lock changes without a `contract/*` branch; PRs that cross into another lane without that lane owner's approving review |

- **Teaching message format** (stderr, exit code 2): `Blocked: apps/world/tick.ts belongs to lane "world"; you are in "brain". Ask instead: lanes msg world --type request "<what you need>". Override (logged): lanes override apps/world/tick.ts --reason "<why>".`
- **Override:** `lanes override <path...> --reason` writes `.lanes/override.json`, which expires after 30 minutes. The guard allows those paths, the pre-commit hook adds a `Lanes-Override: <path> | <reason>` trailer to the commit, and the queue lists overrides in the PR comment. Crossing into another lane still needs that lane owner's review before the queue will merge.

## 10. Messaging (GitHub Issues only)

- **Labels** (created by `lanes init --labels`):
  - message types: `lanes:blocker`, `lanes:request`, `lanes:notice`
  - recipients: `lane:<name>`
  - workflow: `needs-owner`, `claimed`, `auto-fix`, `queue`, `queue-blocked`, `queue-failed`, `contract-change`, `autopilot-off`
- **Machine block:** every Lanes-made issue body and comment starts with `<!-- lanes:{json} -->` (C5), which holds the type, contract, dedup key, attempts and lease. **Every comment written by a bot includes `<!-- lanes:bot -->`, and watchers ignore those comments**, so bots never react to bots.
- **Deduplication:**
  - Blockers are keyed by `blocker:<contract>:<check>:<signature>`. A repeat failure updates the existing issue (comment plus counter) instead of opening a new one.
  - Requests are keyed by the sender's dedup key.
- **`lanes msg <lane> --type request|notice|blocker --contract <Name> "<text>"`** opens or updates an issue.
- **Automatic messages** (deterministic, sent by the queue or a nightly run):
  - an edge turns red → `lanes:blocker` + `auto-fix` to the owner
  - a requested fixture lands → a comment that closes the request
  - a minor relock → `lanes:notice` to the consumers

## 11. Autonomy: watcher and fixer

**The watcher** (`lanes watch --lane <l>`) is a script, not a model:
- **Polling:** every `watch_interval_sec` it polls `gh api` for open issues labeled `lane:<l>` (and their comments) with `since=` and ETag. It costs no tokens while idle.
- **Cache:** keeps `.lanes/cache/inbox.json` up to date.
- **Exits only on something actionable:** a new or updated `lanes:blocker` or `lanes:request` for this lane, or a non-bot comment on one. On exit it prints one JSON line (C7) and exits `0`.
- **Exits silently for nothing new.** Notices are only cached; the inbox hook shows them later.
- **Kill switch:** if the repo's pinned "Lanes control" issue has `autopilot-off`, the watcher reports blockers as `manual`, so the agent tells the human instead of fixing.
- **How it runs:** as a **background Bash command** in Claude Code. When it exits, the agent wakes, handles the item, and **restarts the watcher**, as the `lanes-workflow` skill instructs.

**Fixing** (`lanes fix <issue>` and the `fixer` subagent):
1. `lanes fix <n>` checks autopilot and attempt budgets, then **claims** the issue: the `claimed` label, a machine block with a lease expiry, and a bot comment. If another live lease exists, it refuses.
2. It creates worktree `../<repo>-<lane>-fix-<n>` from `origin/main` on branch `fix/<n>`, and prints the path and the repro command (C8).
3. The main agent spawns the **`fixer` subagent**, which works **only in that worktree** and follows `lanes-fixer`: **reproduce first** (it must see the failure), change implementation only, run `lanes check --lane <l>`.
4. `lanes fix <n> --submit` runs these gates:
   - the check passes
   - the diff stays within the lane's paths
   - no locked files changed
   - changed lines ≤ `fix_size_cap`

   Then it pushes and opens a PR labeled `queue` + `lane:<l>`, with "Fixes #n".
5. `lanes fix <n> --escalate "<reason>"` adds `needs-owner`, comments and releases the claim. Exceeding a gate or `fix_attempts` escalates automatically.
6. A merged fix deletes its worktree (`lanes fix --cleanup`).

## 12. Merge queue (GitHub Action)

**Stateless by design: the labels are the queue, and workflow runs only wake it up.** A GitHub concurrency group holds at most one running and one pending run, and a newer pending run replaces an older one ([docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)). So a run must never assume it's processing "its own" PR. Each run processes *all* labeled PRs. Larger concurrency queues (`queue: max`, [May 2026 changelog](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues)) are fine but not required.

**`.github/workflows/lanes.yml`:**
- **Triggers:**
  - `pull_request` (opened, synchronize, labeled): `lanes check --ci`, plus the PR comment (C9)
  - `schedule` (every 10 min) and `workflow_dispatch`: `lanes queue`
  - `pull_request` labeled `queue`: `lanes queue`
  - nightly: `lanes check --ci --seed random --file-blockers`, which runs fresh fuzz seeds and opens blockers for new failures
- **Concurrency:** group `lanes-queue`, `cancel-in-progress: false`, applied to the queue job only.
- **Permissions:** `contents: write`, `pull-requests: write`, `issues: write`.

**`lanes queue` loop**, with a time budget of 20 minutes:
1. Pick the **oldest** open, non-draft, same-repo PR labeled `queue` and not `queue-blocked`.
2. Rebase onto `origin/main`. On conflict → `queue-blocked`, a bot comment, and a message to the PR's lane.
3. `lanes check --ci`, plus the ownership check against the PR's `lane:<l>`, plus the lock and classification rules, plus the required approver or owner reviews.
4. **Green:** squash-merge. Then **in the same run**, because merges made with `GITHUB_TOKEN` don't trigger new workflow runs:
   - check `main`
   - relock on a minor change
   - close issues listed under "Fixes"
   - send automatic notices
   - open blockers for anything newly red
5. **Red:** `queue-failed` plus a summary comment. Increment `attempts` on the linked issue. At `fix_attempts` → `needs-owner`.
6. Repeat until no queued PRs remain.

**Branch protection on `main`:**
- require a PR, plus the `lanes/check` status
- allow the workflow to merge
- **don't** turn on "require code owner review": agents act under their human's GitHub identity, and nobody can approve their own PR. The queue enforces review only for PRs that cross lanes or make major contract changes.

**PRs from forks** get the check and the PR comment (no secrets needed). Approvers merge them by hand. The queue never processes them.

## 13. Graph and status

- **`lanes graph`** writes `.lanes/cache/graph.json` (C6) and serves a single static HTML page on `localhost:4517`. The page reloads when `graph.json` changes.
  - **Nodes are lanes:** owner, and counts of open blockers and requests.
  - **Edges are contracts**, with a status color *and* a text label (no color-only meaning), version and fixture counts.
  - **Clicking an edge** shows failures, the seed, the repro command and the owner of the fix.
- **PR comment** (C9): an edge status table, the classification, overrides, and the queue state.
- **`lanes status`:**
  - edge summary
  - the `needs-owner` list
  - claimed fixes in flight
  - **three numbers** over the last 7 days, computed from GitHub:
    - auto-merge share: merged PRs with `auto-fix` or without human commits, divided by merged PRs
    - revert rate: merged PRs reverted within 7 days, divided by merged PRs
    - median time from blocker to merged fix

## 14. CLI reference

| Command | Purpose |
|---|---|
| `lanes init [--labels]` | Ask about capacity and preset, write the skeleton (§5), create labels and the pinned control issue |
| `lanes join <lane>` | Bind this worktree to a lane: `.lanes/local.json` (C2) |
| `lanes check [--lane l] [--fast] [--ci] [--json] [--seed n] [--file-blockers]` | §7 |
| `lanes lock [--allow-open n]` | §8 |
| `lanes msg <lane> --type t [--contract c] "<text>"` | §10 |
| `lanes watch --lane <l>` | §11 |
| `lanes fix <n> [--submit \| --escalate "r" \| --cleanup]` | §11 |
| `lanes queue` | §12 (CI only) |
| `lanes graph` | §13 |
| `lanes status` | §13 |
| `lanes override <paths> --reason "r"` | §9 |
| `lanes autopilot on\|off` | Toggle `autopilot-off` on the control issue |
| `lanes doctor` | Check node version, `gh auth`, plugin and CLI version vs `lanes_version`, git hooks installed, lane binding, workflow file, labels, control issue, branch protection. Each failure prints its fix. |
| `lanes hook <session-start\|prompt\|guard\|stop>` | Internal, called by plugin hooks (C10) |
| `lanes codeowners` | Regenerate `.github/CODEOWNERS` from `lanes.yaml`. `init`, and any `lanes.yaml` change through the queue, run it. |

## 15. Claude Code plugin

```
plugin/
├─ .claude-plugin/plugin.json            # name, version (= CLI version), description
├─ bin/lanes.mjs                         # core bundled with esbuild into one file
├─ hooks/hooks.json
├─ skills/
│  ├─ lanes-workflow/SKILL.md            # join, loop, watcher restart, messaging, done = green; planning section for init
│  ├─ lanes-contracts/SKILL.md           # writing schemas, fixtures, consumer tests, handlers; minor vs major; expand→migrate→contract
│  └─ lanes-fixer/SKILL.md               # reproduce first, implementation only, gates, escalate
├─ agents/fixer.md                       # subagent: works only inside the fix worktree it is given
└─ commands/
   ├─ init.md     # runs `lanes init`, then guides brief → SPEC.md → lanes.yaml → contracts (planning lives in lanes-workflow)
   ├─ join.md     # $ARGUMENTS = lane
   ├─ status.md
   ├─ watch.md    # starts `lanes watch --lane <bound lane>` as a background command
   └─ doctor.md
.claude-plugin/marketplace.json          # at repo root: { name, owner, plugins: [{ name: "lanes", source: "./plugin" }] }
```

**`hooks/hooks.json`.** Every command is `node ${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs hook <event>`, which reads the hook's stdin JSON:

| Event | Matcher | Behavior | Budget |
|---|---|---|---|
| `SessionStart` | n/a | Prints context: lane, paths, produced and consumed contracts, owned red edges, unread blockers and requests, version mismatch, or "run /lanes:join" | < 300 ms |
| `UserPromptSubmit` | n/a | Prints new actionable items from `inbox.json` since they were last shown. Prints nothing if there are none. | < 300 ms |
| `PreToolUse` | `Edit\|Write\|MultiEdit\|NotebookEdit\|Bash` | §9. Exit `2` plus the teaching message to block. | **< 100 ms** (reads `.lanes/cache/ownership.json`; no zod or vitest loading) |
| `Stop` | n/a | Only if `stop_gate: true`. If `stop_hook_active` is true → allow (prevents loops). Otherwise runs `check --fast --lane`. Red → `{"decision":"block","reason":…}`. | < 20 s |

Install: `/plugin marketplace add <owner>/lanes`, then install `lanes`. Each skill's `description` is written so it loads only when relevant, which keeps context cost low.

## 16. Other agents (Codex, Cursor, Gemini CLI, Antigravity…)
- `init` appends a "Lanes rules" section to `AGENTS.md` covering the loop, messaging and done-means-green.
- They use the CLI through the shell. **They don't get hooks, so enforcement for them comes from the git hook plus the queue.** Nothing red reaches `main`.
- An MCP server is deferred until non-Claude users ask for it.

## 17. Team use
- **Adding a person:**
  1. Make them a GitHub collaborator.
  2. Set `lanes.<l>.owner` and merge through the queue, which regenerates CODEOWNERS.
  3. They install the plugin, run `lanes doctor`, then `/lanes:join <l>`.
- **Escalations route by owner:** `needs-owner` issues are assigned to the lane owner. Cross-lane items go to `approvers`.
- **Two people in one lane:** separate worktrees. Issue claims plus the queue prevent duplicate work and merge races.
- **Handing off a lane:** edit the owner field and use the "handoff" issue template. There's no special command.

## 18. Budgets

| Budget | Limit |
|---|---|
| Core CLI | ≤ about 2,500 lines of non-test code |
| Plugin markdown | ≤ about 600 lines |
| Runtime dependencies | `zod` (peer), `vitest` (peer), `fast-check`, `yaml` |
| External tools | `git`, `gh` |
| Guard hook | < 100 ms |
| `check --fast --lane` | < 20 s on the example repo |
| `check --ci` | < 90 s on a 3-lane repo with 10 contracts |
| Cost | Zero model calls. The only spend is your agents. |

## 19. Security and trust
- **Messages are data, not commands.** Skills say so, and the guard enforces boundaries whatever a message says. One agent's output can't make another agent edit outside its lane.
- **No secrets in the repo or in issues.** `gh` uses the developer's existing authentication, and CI uses `GITHUB_TOKEN`.
- **Fork PRs never run the queue.**
- **Overrides are logged** in commit trailers and PR comments.

## 20. Platform assumptions to verify before building

| Assumption | Used in |
|---|---|
| Hook stdin carries `tool_input.file_path` (file tools), `tool_input.command` (Bash) and `stop_hook_active` (Stop) ([hooks docs](https://code.claude.com/docs/en/hooks)) | §9, §15 |
| SessionStart and UserPromptSubmit stdout becomes context, and exit code 2 blocks PreToolUse and Stop | §15 |
| `${CLAUDE_PLUGIN_ROOT}`, the plugin layout and `marketplace.json` match the [plugins reference](https://code.claude.com/docs/en/plugins-reference) and [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference) | §15 |
| A background Bash command that exits wakes the agent (otherwise fall back to `/loop` polling) | §11 |
| Events created with `GITHUB_TOKEN` don't start new workflow runs, which is why post-merge steps run inside the queue run | §12 |
| Zod's `toJSONSchema` is available (zod v4) | §8 |

## 21. Milestones and acceptance

| Milestone | Scope | Accepted when |
|---|---|---|
| **M1: correctness, local** | `init`, `join`, `check` (§7), `lock`, guard (hook + git), `graph` (local), `doctor` (local checks) | The example repo is green on the first run. The sample bug (a handler returns `holdMs: 1800` against a max of 1500) shows red with a seed and the smallest counterexample. The guard blocks a cross-lane edit in under 100 ms with the teaching message. |
| **M2: team and autonomy** | `msg`, `watch`, `fix`, `queue` Action, PR comment, `status` with its 3 numbers, `codeowners`, `autopilot` | On a 3-lane sample repo: a planted bug → blocker filed → watcher wakes the fixer → fix PR → queue merges it → edge turns green, with **no human action**. Two PRs that each pass alone but conflict together: the second one bounces. |
| **M3: polish** | Stop gate, `override`, minor/major classification and auto-relock, pinned-version warnings, labels and control issue in `init` | **A new user goes from zero to a green graph in 5 minutes.** You've used it every day on one real project for a week. |
