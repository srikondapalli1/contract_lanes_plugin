# Lanes benchmarks

Reproducible measurements of `contract-lanes` against the alternatives an agent team would otherwise use:
prompt-only rules in `CLAUDE.md`, Pact consumer-driven contract tests, hand-written zod + vitest tests, and
TypeScript types alone. Results and charts are in [`REPORT.md`](REPORT.md).

## Run

```sh
cd bench
npm install                 # offline tokenizers: @anthropic-ai/tokenizer, js-tiktoken
npm --prefix .. install     # the repo's own devDependencies (zod, vitest, typescript), if not installed yet
node mutants.mjs            # 2. bug-catch study (~5 min; installs Pact into a temp dir if needed)
node tokens.mjs             # 1. token cost + idle-polling model (needs the Pact install from mutants.mjs)
node guard-scenarios.mjs    # 6. which edits the guard / pre-commit hook block
node setup-size.mjs         # 5. files and lines an agent authors per approach
node speed.mjs              # 3. latency (run alone: it is timing-sensitive)
node sensitivity.mjs        #    rare-bug detection vs property_runs
node install.mjs            # 4. install footprint (network; fresh npm cache per run)
node charts.mjs             # merge results/raw/*.json → results/results.json, render results/*.svg (+ .png)
```

Or `node run-all.mjs` to run them in that order.

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `LANES_BIN` | `../plugin/bin/lanes.mjs` | The CLI under test (point it at a frozen build to benchmark a snapshot). `contract-lanes/test` resolves to the same build. |
| `BENCH_TMP` | OS temp dir | Where example copies, installs and npm caches are created. |
| `SEEDS` | `10` | Seeds per mutant for `lanes check` (mutants.mjs, sensitivity.mjs). |
| `POOL` | `4` | Concurrent `lanes check` workers (each gets its own repo copy). |
| `GUARD_RUNS` / `CHECK_RUNS` | `50` / `7` | Repetitions in speed.mjs. |
| `INSTALL_RUNS` | `2` | Fresh installs per package set. |

Everything runs offline except `install.mjs` (and the one-time Pact install). No model is called; token counts
use an offline tokenizer and are approximate.

## Files

- `lib.mjs`: shared helpers (example-repo copies, tokenizer, stats, results I/O).
- `alternatives/`: the comparison code that the scripts run or measure:
  `prompt-only/CLAUDE.md`, `pact/*.pact.test.ts`, `zod-vitest/tick.zod.test.ts`, `tsc/tsconfig.json`.
- `results/raw/*.json`: one file per benchmark; `results/results.json`: all of them merged; `results/*.svg|png`: charts.
