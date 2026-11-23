# Lanes

**Contract-first parallel development for coding agents. Small tool, hard guarantees.**

Lanes lets several coding agents (and humans) build one project in parallel without breaking each other:

- **Lanes**: the project is split into lanes, each owning its own folders (`lanes.yaml`).
- **Contracts**: lanes talk only through zod schemas plus JSON fixtures (`contracts/`, `fixtures/`).
- **Checks**: every contract is checked mechanically: fixtures, consumers' tests, schema-generated values,
  mutations of fixtures, and **property tests of handler code that agents can't game** (seeded, shrunk to the
  smallest counterexample).
- **Enforcement**: Claude Code hooks block cross-lane edits and changes to locked contracts *while agents work*.
  A git pre-commit hook and a merge queue back them up for every other tool.
- **Communication and merging**: agents message each other through GitHub Issues. A watcher wakes a fixer
  subagent in an isolated worktree, and a stateless merge queue keeps `main` green.
- **Visibility**: a live graph shows which interface is broken and who owns the fix.

No model calls in the tool: every check is deterministic, so it's free, fast, and agents can't argue past it.
Removing Lanes leaves a normal repo (plain zod, vitest, YAML, GitHub labels).

![Lanes graph: the planted holdMs bug shows TickResponse brain → world red, with seed, repro and owner](docs/graph.png)

Website: **[srikondapalli1.github.io/contract_lanes_plugin](https://srikondapalli1.github.io/contract_lanes_plugin/)** (source in [`site/`](site/), deployed by the `pages` workflow).

▶ **[70-second demo video](docs/lanes-demo.mp4)**: a real check finds the planted bug, the guard blocks a cross-lane
edit, an agent fixes it and the live graph turns green, then the same loop on real GitHub.

It ships as **one CLI** (`contract-lanes`, command `lanes`), **a Claude Code plugin** (`plugin/`) and **one
GitHub Action workflow** (`lanes init` writes it). All three call the same code.

## Hackathon setup: paste one prompt

**Project lead:** paste this into Claude Code, Cursor, Codex or any coding agent that can run shell commands, from the
repo you want to build in:

```text
Set up Lanes (https://github.com/srikondapalli1/contract_lanes_plugin) in this repo so several coding agents can build
it in parallel without breaking each other.
1. Run `npx --yes contract-lanes init --yes`. If this is a GitHub repo and `gh auth status`
   works, also run `npx lanes init --labels`.
2. Install dependencies (npm install, or the repo's package manager), then run `npx lanes check`. It must exit 0.
3. Ask me in one message what we're building, who is on the team (GitHub handles) and how many agents will run at
   once. Then propose 2-6 lanes (folders each person or agent owns) and the contracts between them, and wait for my OK.
4. Write lanes.yaml, one zod contract per interface in contracts/ with fixtures (at least 1 valid and 1 invalid each)
   and a consumer test for each consumer. Remove the Example contract if we don't need it. Re-run `npx lanes check`
   until it's green, then commit and push.
5. For each teammate run `npx lanes invite @handle --lane <lane>` and show me the messages it prints, so I can
   forward them.
6. If you are Claude Code, run `claude plugin marketplace add srikondapalli1/contract_lanes_plugin` and
   `claude plugin install lanes@contract-lanes`, then tell me to restart. Otherwise follow the rules in AGENTS.md.
```

**Adding people:** `npx lanes invite @handle --lane brain` adds them as a collaborator, makes them that lane's owner,
regenerates CODEOWNERS, and prints a message to send them. It contains their prompt:

```text
Join our Lanes project and set up my lane. Repo: https://github.com/<you>/<repo>  My lane: <lane>
1. Clone the repo if it isn't here yet, cd into it, and install dependencies (npm install, or the repo's package manager).
2. Run `npx lanes doctor` and fix anything local it flags.
3. Run `npx lanes join <lane>`, then `npx lanes check --lane <lane>` and summarize what my lane owns and what is red.
4. If you are Claude Code, run `claude plugin marketplace add srikondapalli1/contract_lanes_plugin` and
   `claude plugin install lanes@contract-lanes`, then tell me to restart Claude Code and run /lanes:watch.
   Otherwise read AGENTS.md and follow its Lanes rules.
5. From now on: edit only my lane's paths, ask other lanes with `npx lanes msg <lane> --type request "..."`,
   done means `npx lanes check --lane <lane>` exits 0, and ship through a PR labeled queue and lane:<lane>.
```

When the interfaces stop moving (often after the first hour), run `npx lanes lock`. From then on `main` only changes
through the queue.

## How autonomous is it?

| Step | Who does it | Needs a running agent? |
|---|---|---|
| Detect a broken contract, from either side | `lanes check`: in each agent's loop, on every PR, nightly with fresh seeds, and after every queue merge (the last three in GitHub Actions) | no |
| Decide whose fix it is | every failure names an owner: the producer for schema, fixture and handler failures, the consumer for its own tests | no |
| Tell that lane | a deduplicated `lanes:blocker` issue labeled `lane:<owner>` and `auto-fix` | no (GitHub Actions) |
| Wake an agent | `lanes watch` running in that lane's session exits on the new blocker | **yes**: a Claude Code session with `/lanes:watch` |
| Write the fix | the `fixer` subagent in an isolated worktree. `fix --submit` refuses unless the check is green, the diff stays in the lane, no contract or fixture changed, and it's ≤ 200 lines | **yes** (that session's model) |
| Merge it | the queue job in GitHub Actions: rebase on the latest `main`, re-check, squash-merge, close the issue | no |
| Stop and ask a human | after 2 failed attempts, a failed gate, a change that crosses lanes, or a major contract change: `needs-owner`, assigned to the lane owner | no |

Detection, routing, re-checking and merging run on GitHub with nobody watching. Writing the fix needs one agent
session per lane to be running, because Lanes itself never calls a model. If none is running, the blocker waits as an
issue, and the next session in that lane sees it at startup. This loop ran end to end against real GitHub and
GitHub Actions, with no human steps (see "Verified here").

## Quickstart (zero to green in under a minute)

In Claude Code:
```
/plugin marketplace add srikondapalli1/contract_lanes_plugin
/plugin install lanes@contract-lanes
/lanes:init
```
Or from a shell, in an empty or existing repo:
```bash
npx --yes contract-lanes init                                  # writes lanes.yaml, an example contract, hooks, workflow
npm install                                                    # contract-lanes + vitest + zod (devDependencies)
npx lanes check                                                # green on the first run
git add -A && git commit -m "lanes init"
npx lanes join app                                             # one lane per session/worktree
npx lanes lock                                                 # when interfaces settle: main becomes queue-only
```
> `init` adds `contract-lanes@^<version>` from npm as a devDependency, or this GitHub repo if npm can't be reached
> (the package is the repo root, and its built `plugin/bin` is committed). Override with `--pkg <spec>` or `LANES_PKG`.

For a GitHub repo, `lanes init --labels` (rerunnable) creates the labels and the pinned "Lanes control" issue.
Then protect `main`: require a PR plus the `lanes/check` status. Don't require code-owner review: the queue
enforces review only for cross-lane and major contract changes.

## How it looks

```yaml
# lanes.yaml
lanes_version: "^0.1.0"
approvers: ["@you"]
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

`lanes check` on [`examples/three-lanes`](examples/three-lanes) (brain's handler has a planted bug: spooked agents hold 1800 ms, max 1500):
```
lanes check · local · main · seed 42
✅ pass      TickRequest   world → brain  v1.0.0 · fixtures 2 valid/2 invalid · 2 consumer test(s)
❌ fail      TickResponse  brain → world  v1.0.0 · fixtures 1 valid/1 invalid · 1 consumer test(s)
✅ pass      Haunt         crowd → world  v1.0.0 · fixtures 1 valid/1 invalid · 2 consumer test(s)
✅ pass      Haunt         crowd → brain  v1.0.0 · fixtures 1 valid/1 invalid · 1 consumer test(s)

Failures (1):
  ✗ [handler-property] TickResponse · owner brain: handler tick (apps/brain/src/tick.ts#tick) returned an invalid
    TickResponse: actions[0].holdMs: Too big: expected number to be <=1500
      seed: 42
      counterexample: {"tick":0,"worldId":" ","agents":[{"id":"a-0","at":{"x":0,"y":0},"mood":"spooked"}]}
      repro: npx lanes check --lane brain --seed 42

✅ 3 pass · ❌ 1 fail · ⏳ 0 pending · ○ 0 untested   (1.5s, exit 1)
```

While an agent bound to `brain` works, the guard answers its edits:
```
Blocked: apps/world/src/apply.ts belongs to lane "world"; you are in "brain". Ask instead: npx lanes msg world
--type request "<what you need>". Override (logged): npx lanes override apps/world/src/apply.ts --reason "<why>".
```

## Commands

| Command | Purpose |
|---|---|
| `lanes init [--labels] [--lanes a,b,c] [--laptops n --sessions n --hours n]` | Skeleton, example contract, hooks, workflow, CODEOWNERS, AGENTS.md rules; `--labels` sets up GitHub |
| `lanes join <lane>` | Bind this worktree to a lane (`.lanes/local.json`) and install git hooks |
| `lanes check [--lane l] [--fast] [--ci] [--json] [--seed n\|random] [--file-blockers] [--pr n]` | Config → ownership → schemas → fixtures → generated + mutations → handler properties → consumer tests → lock → edges. Exit 0/1/2 |
| `lanes lock [--allow-open n]` | Write `contracts.lock`; ends setup phase |
| `lanes msg <lane> --type request\|notice\|blocker [--contract C] "<text>"` | Open or update (dedup) a GitHub issue to a lane |
| `lanes watch --lane <l> [--once]` | Zero-token background poller; exits with one JSON line when something actionable arrives |
| `lanes fix <n> [--submit \| --escalate "r" \| --cleanup]` | Claim + lease + isolated worktree; gated submit opens a `queue` PR |
| `lanes queue` | Stateless merge queue (CI): rebase, re-check, review rules, relock, squash-merge, post-merge blockers |
| `lanes graph [--port 4517]` | Live graph on localhost |
| `lanes status` | Edges, needs-owner, fixes in flight, and three 7-day numbers |
| `lanes override <paths…> [--push] --reason "r"` | 30-minute logged override (commit trailer + PR comment) |
| `lanes invite @handle [--lane l]` | Add a teammate: collaborator invite, lane owner, CODEOWNERS, and their copy-paste prompt |
| `lanes autopilot on\|off` | Kill switch on the control issue |
| `lanes doctor` | Node, gh auth, versions, hooks, binding, workflow, labels, control issue, branch protection |
| `lanes codeowners` | Regenerate `.github/CODEOWNERS` from `lanes.yaml` |
| `lanes hook <session-start\|prompt\|guard\|stop>` | Plugin internals (C10) |

## Verified here

Everything below runs in `pnpm test` (116 tests) or was run by hand in this environment:

| What (BUILD.md / SPEC §21) | Result |
|---|---|
| Green first run: `init` in an empty dir → `npm install` of the **packed tarball** from the real registry → `check` | exit 0, **4.5 s** end to end (vitest 5.1.1) |
| Planted bug | exit 1 · `handler-property` failure with seed, a **shrunk one-agent counterexample** and a repro that reproduces it exactly; graph edge red |
| Guard blocks a cross-lane edit | exit 2 + teaching message · **~46 ms median** (budget 100 ms; bare `node` startup is ~31 ms) |
| All C10 hook fixtures (24 cases: guard, session-start, prompt, stop gate) | pass against the bundled plugin binary, without starting Claude Code |
| Lock: fixture edit on `main` → failure; on `contract/Haunt-rename` → **major**; optional field / enum value → **minor** | pass |
| **M2 autonomy loop** (fake GitHub: fake `gh` + local bare remote): bug lands → nightly files blocker → watcher wakes → `fix` claims + worktree → fixer reproduces and fixes → `fix --submit` gates → `queue` rebases, re-checks, merges → issue closed, main green | pass, **no human action** |
| Two PRs that pass alone but conflict together | first merges, second gets `queue-failed` |
| Two compatible PRs | both merge in order; the second is rebased, re-checked, force-pushed with lease and gets `lanes/check` first |
| **Real GitHub** ([sandbox repo](https://github.com/srikondapalli1/srikondapalli1-lanes-sandbox)): labels + control issue → lock → bug lands → nightly-style check files blocker #2 → watcher → `fix 2` → reproduce, fix → `fix --submit` opens PR #3 → the **Actions queue job** re-checks and merges it (`github-actions[bot]`) → issue closed, PR comment says merged, `main` green | pass, no human action. It also surfaced 3 bugs, now fixed |
| vitest 3.2.7 / 4.1.12 / 5.1.1 | same results |
| `claude plugin validate` (plugin + marketplace) | passed |
| Lanes checks itself (C1–C10 contracts + a `graphFromReport` handler property test) | 12/12 edges green |
| Budgets | core 2,440 lines of logic + 265 lines of zod contracts (~2,500); plugin markdown 251 (≤600) |

## Benchmarks

[`bench/REPORT.md`](bench/REPORT.md) compares Lanes with prompt-only `CLAUDE.md` rules, Pact, hand-written zod + vitest
tests and TypeScript alone on the three-lane example. Every number is reproducible with `bench/run-all.mjs`.

| | Lanes | Pact | zod + vitest | tsc |
|---|---|---|---|---|
| Seeded producer bugs caught (19) | **19/19 on every one of 10 seeds** | 6 | 8 | 3 |
| Always-loaded agent context | ~500 tokens (plugin listing + SessionStart); enforced | needs prompt rules (~600 tokens, not enforced) | same | same |
| Failure output for the same bug | 321 tokens | 1,909 tokens | 493 | 402 |
| Idle cost of waiting for messages | 0 tokens/h (`lanes watch` is a script) | `/loop` polling: 150K–3M tokens/h at 50K context | | |
| Added install on top of vitest | +9 MB, 4 packages | +33 MB, 133 packages, native lib | 0 | 0 |

![Seeded bugs caught by approach](bench/results/bug-catch.svg)

Token counts are approximate (offline tokenizer). The example is small and the bugs were seeded by hand, so read the
rates as which *kinds* of bugs each approach can see. See the report's caveats.

## Repo layout

```
packages/core/src/      TypeScript CLI + library (contracts C1–C10, config, generate, check, lock, guard,
                        graph-data, github, watch, fix, queue, status, hooks, graph, cli, test helpers)
packages/core/fixtures/ fixtures for C1–C10 (HookIO doubles as the plugin's hook test cases)
packages/core/web/      graph.html (inlined into the bundle)
packages/core/test/     unit + e2e tests, fake gh
plugin/                 Claude Code plugin (bin/ is the esbuild bundle, committed)
.claude-plugin/         marketplace.json
examples/three-lanes/   world/brain/crowd sample with the planted bug
docs/                   the original SPEC/CONTRACTS/BUILD
```

Develop: `pnpm install && pnpm bundle && pnpm test`. CI checks that the committed bundle matches the source.
Lanes runs on its own repo (`lanes.yaml`, `contracts.lock`, `.github/workflows/lanes.yml`), so changes to
C1–C10 need a `contract/*` branch.

## Publishing to npm

`.github/workflows/publish.yml` publishes `contract-lanes` with provenance through npm trusted publishing, so no npm
token is stored anywhere. It re-runs the bundle check, typecheck and tests first, and does nothing if that version is
already on npm. To release: bump `version` in `package.json` and `plugin/.claude-plugin/plugin.json`, then
**Actions → publish → Run workflow** on `main` (or publish a GitHub release).

One-time setup: npm only lets you add a trusted publisher to a package that already exists, so the
first version is published by hand (`npm login`, then `npm publish --access public`, which asks for the 2FA code).
Then on npmjs.com: **contract-lanes → Settings → Trusted Publisher → GitHub Actions**, with owner `srikondapalli1`,
repository `contract_lanes_plugin` and workflow `publish.yml`.

Once the package exists, `lanes init` writes `contract-lanes@^version` instead of the GitHub fallback.

## Notes and limits

- **Name**: the npm package is `contract-lanes` (`lanes` is taken), so helpers import from `contract-lanes/test`
  (`fixturesOf`, `schemaOf`, `arbitraryOf`, `fc`).
- **npm 10.9 + vitest 4.1** crashes npm's installer (an upstream arborist bug), so `init` pins `vitest ^5.1.0`.
  Any vitest ≥ 3.2 works.
- The automated autonomy e2e uses a fake of the GitHub REST endpoints Lanes calls. The same loop was also run once
  against real GitHub and real Actions (see the table above).
- Claude Cowork / claude.ai don't install plugins with a top-level `bin/`. Claude Code does, and puts `lanes` on the Bash PATH.
- Deferred by design (SPEC §3): MCP server, hosted graph, `adopt`, non-TypeScript languages.
