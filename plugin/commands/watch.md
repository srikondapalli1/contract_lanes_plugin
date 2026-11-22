---
description: Start the Lanes watcher for the bound lane as a background command
---

1. Read the bound lane from `.lanes/local.json`. If there isn't one, ask the user to run `/lanes:join <lane>` first.
2. Start `node "${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs" watch --lane <lane>` as a **background** Bash command.
   It polls GitHub cheaply and exits with one JSON line only when something actionable arrives.
3. When it exits, handle the items per the **lanes-workflow** skill (blockers with `autopilot: true` → the
   **lanes-fixer** flow; otherwise tell the human). Then **restart it** with the exact `next` command it printed.
