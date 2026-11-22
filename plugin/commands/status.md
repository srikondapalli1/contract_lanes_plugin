---
description: Lanes status (edges, needs-owner, fixes in flight, 7-day numbers)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/lanes.mjs" status` and present it compactly: red edges with their owner and
repro first, then needs-owner items (a human must decide), fixes in flight, and the three 7-day numbers.
If there's no report yet, run `lanes check` first. Mention `lanes graph` for the live graph on localhost:4517.
