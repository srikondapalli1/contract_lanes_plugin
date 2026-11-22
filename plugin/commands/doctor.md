---
description: Check the Lanes setup (node, gh auth, versions, hooks, binding, workflow, labels, branch protection)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs" doctor`. For each ✗ line, explain the printed fix in one line and
offer to apply the ones that are local and safe (installing peers, `lanes join`, regenerating hooks).
Don't change GitHub settings without asking.
