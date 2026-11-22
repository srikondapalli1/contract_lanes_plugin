# Lanes: Claude Code plugin

Contract-first parallel development for coding agents. A project is split into **lanes** that own folders
and talk only through **contracts** (zod schemas plus JSON fixtures). This plugin makes those rules real while
agents work:

- **SessionStart** prints your lane, what you produce and consume, red edges you own and unread messages.
- **PreToolUse** (Edit/Write/MultiEdit/NotebookEdit/Bash) blocks edits outside your lane, edits to locked
  contracts off a `contract/*` branch, pushes to `main` after lock, and force-pushes. Each block explains
  what to do instead. It answers in under 100 ms.
- **UserPromptSubmit** surfaces new blockers and requests from other lanes (GitHub issues).
- **Stop** (opt-in `stop_gate`) keeps the agent from declaring "done" while its lane is red.
- Skills `lanes-workflow`, `lanes-contracts` and `lanes-fixer`, a `fixer` subagent, and the commands
  `/lanes:init`, `/lanes:join`, `/lanes:status`, `/lanes:watch` and `/lanes:doctor`.

All checks are deterministic: zero model calls. Install with `/plugin marketplace add srikondapalli1/contract_lanes_plugin`,
then `/plugin install lanes@contract-lanes`, then run `/lanes:init` in your repo. Full docs:
https://github.com/srikondapalli1/contract_lanes_plugin
