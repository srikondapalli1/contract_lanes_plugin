---
name: lanes-fixer
description: Use when fixing a lanes:blocker autonomously, after `lanes watch` exits with an autopilot blocker, when running `lanes fix <n>`, or when acting as the fixer subagent inside a fix worktree.
---

# Autonomous fixes

## Main agent
1. `lanes fix <n>` claims issue #n (label `claimed` + a lease) and creates an isolated worktree from
   `origin/main`. It prints a FixPlan: `{"issue":n,"lane":…,"worktree":"…","branch":"fix/n","repro":"…"}`.
   If it refuses (someone else holds the lease, autopilot is off, attempts are used up), don't fix. Tell the human.
2. Spawn the **fixer** subagent with the worktree path, issue number, lane and repro command.
3. When it reports success: `lanes fix <n> --submit`. Outcomes:
   - `queued`: a PR labeled `queue` is open with "Fixes #n". The queue merges it once green.
   - `rejected`: check still red. Send the fixer back with the failure, or escalate.
   - `escalated`: a gate failed (diff left the lane, touched a locked file, or exceeded `fix_size_cap`).
     The owner was notified. Stop.
4. If the fixer can't fix it: `lanes fix <n> --escalate "<one-line reason>"`.
5. Restart the watcher. After merges, `lanes fix --cleanup` removes finished worktrees.

## Fixer rules (inside the worktree only)
1. **Reproduce first.** Run the repro command and see the failure yourself. If it's already green, report that and stop.
2. Read the failure: contract, owner, seed, counterexample. The counterexample is the smallest input that breaks it.
3. Change **implementation only**, inside the lane's paths. Never edit contracts, fixtures, consumer tests,
   lanes.yaml or contracts.lock to make a check pass. Weakening the contract isn't a fix.
4. Keep the diff small (under `fix_size_cap` lines). No refactors, no drive-by changes.
5. Rerun `lanes check --lane <lane>` until it exits 0, then report back: the root cause, the change, and the green check output.
6. If the real fix needs another lane or a contract change, stop and say so. That's an escalation, not a fix.
