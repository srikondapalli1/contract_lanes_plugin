---
description: Set up Lanes in this repo (lanes.yaml, example contract, hooks, workflow), then plan lanes with the user
argument-hint: "[lane names, e.g. world,brain,crowd]"
---

Set up Lanes here, following the **lanes-workflow** skill's planning section.

1. If `lanes.yaml` already exists, run `node "${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs" doctor` and stop.
2. Ask the user (briefly) how many laptops × agent sessions they have, and for how many hours. Then run:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs" init --yes --laptops <n> --sessions <n> --hours <h>` (add `--lanes $ARGUMENTS` if lane names were given, and `--labels` if this is a GitHub repo with `gh` authenticated).
3. Install peers: `npm install` (or the repo's package manager). Then run `lanes check`. It must be green on the first run.
4. Guide the plan: brief → `SPEC.md` (what we're building, one paragraph per lane) → edit `lanes.yaml`
   (2–6 lanes, non-overlapping paths, each producing ≥1 contract) → write `contracts/<Name>.ts` + fixtures
   for each interface (see **lanes-contracts**). Re-run `lanes check` after each step and fix warnings.
5. Commit. When interfaces settle, `lanes lock`, commit `contracts.lock`, and protect `main`
   (require PR + `lanes/check`). Each session then runs `/lanes:join <lane>`.
