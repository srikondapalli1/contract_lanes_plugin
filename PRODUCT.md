# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS page in `site/`, deployed with GitHub Pages (the user's answer). The demo video's cards are rendered from HTML in the same visual world.

## Users

Hackathon teams: 2–6 people, each running a coding agent (Claude Code, Cursor, Codex) on part of one shared repo, against a deadline. They want to build in parallel without the agents breaking each other's work, and they will not do manual setup. (Primary audience confirmed by the user; engineering leads evaluating Lanes for a team are a secondary audience.)

## Product Purpose

Lanes (npm package `contract-lanes`, CLI `lanes`, Claude Code plugin) lets several coding agents build one project in parallel. The repo is split into lanes (folders with an owner); lanes talk only through contracts (zod schemas plus JSON fixtures); every contract is checked deterministically; hooks keep each agent inside its lane while it works; GitHub issues carry messages between lanes; a watcher wakes the owning agent; a merge queue on GitHub Actions keeps `main` green. Success: a team goes from nothing to a green check in minutes, and nothing red reaches `main`.

## Positioning

Lead claim (confirmed): Lanes catches what others miss. It property-tests the code behind each contract (generated inputs, every output validated, failures shrunk to the smallest counterexample with a seed and a repro), on top of fixtures, mutations and consumer tests. Example-based contract tests and types check shapes; Lanes checks behaviour. The tool makes no model calls, so its verdicts are deterministic.

## Operating Context

A hackathon: laptops, one agent session per lane, a shared GitHub repo, GitHub Actions running the PR check, nightly fuzz and the merge queue. Setup is pasting one prompt into the agent; teammates join with `lanes invite @handle --lane <lane>`. Status lives in `lanes status`, the live `lanes graph` page, and issue labels.

## Capabilities and Constraints

- Commands: init, join, check, lock, msg, watch, fix, queue, graph, status, override, autopilot, invite, doctor, codeowners.
- TypeScript projects only (v1). Needs Node ≥ 20, git, and `gh` for the GitHub features.
- Detection, routing, re-checking and merging run without anyone online; writing a fix needs a running agent session for that lane.
- Not yet published to npm: installs come from the GitHub repo until it is.

## Brand Commitments

Name: Lanes (package `contract-lanes`, repo `srikondapalli1/contract_lanes_plugin`). Status is never shown by colour alone (an existing product rule). The three-bar mark used in the graph page is incumbent but not confirmed as binding (inferred).

## Evidence on Hand

- Benchmark: `bench/REPORT.md` and `bench/results/*.svg`. On the three-lane example with 19 hand-seeded bugs, Lanes caught 19/19 on every one of 10 seeds; Pact 6, hand-written zod + vitest 8, TypeScript strict 3. Guard hook ~43 ms median; idle watcher 0 tokens/hour. Small example; read as kinds of bugs caught, not a population rate.
- Real check output with the planted bug shrunk to one spooked agent, seed and repro: `examples/three-lanes`.
- Real GitHub run: `srikondapalli1/srikondapalli1-lanes-sandbox`, blocker #2 filed by the nightly check, fix PR #3 merged by `github-actions[bot]` through the queue 22 s after it opened, no human step.
- The live graph: `lanes graph`, screenshot `docs/graph.png`; 70-second video `docs/lanes-demo.mp4`.
- None exist and none may be invented: users, customers, testimonials, logos, press, download counts, pricing.

## Product Principles

1. Prove, don't claim: show the real output, the real numbers, the real run.
2. Setup is one paste; never bury it.
3. Rigour without enterprise stiffness: hackathon speed, engineering honesty.
4. Deterministic: no model calls in the tool, so no agent can argue past a check.

## Accessibility & Inclusion

Status is always carried by a word or glyph as well as colour.
