---
description: Bind this worktree to a lane (ownership guard, context, watcher)
argument-hint: "<lane>"
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs" join $ARGUMENTS` and show the output.
If no lane was given or it's unknown, list the lanes from `lanes.yaml` and ask which one.
Then run `lanes check --lane <lane>` and summarize the edges this lane owns (red first).
Offer to start the watcher (`/lanes:watch`). From now on follow the **lanes-workflow** skill.
