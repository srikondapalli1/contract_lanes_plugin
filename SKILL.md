---
name: lanes
description: Contract-first parallel development for coding agents. Split a repo into lanes that own folders and talk only through contracts, so parallel agents cannot break each other's work. Use when running two or more coding agents in one repo, or when a merge keeps breaking main.
---

# Lanes

Run parallel coding agents in one repo without them breaking each other. Each lane owns its folders; lanes talk only through contracts (zod schemas + JSON fixtures); a Claude Code hook blocks cross-lane edits in ~46ms; a merge queue keeps main green.

## Install

- Claude Code plugin: `/plugin marketplace add srikondapalli1/contract_lanes_plugin`, then `/plugin install lanes@contract-lanes`, then `/lanes:init`
- CLI: `npx contract-lanes init`

## Skills in this repo

- `plugin/skills/lanes-workflow` — the full workflow (join a lane, check it, ship it)
- `plugin/skills/lanes-contracts` — define and evolve contracts between lanes
- `plugin/skills/lanes-fixer` — fix a broken contract without touching other lanes

## Proof

118 tests. Benchmark caught 19/19 seeded producer bugs on every one of 10 seeds. 70-second demo video: `docs/lanes-demo.mp4`.
