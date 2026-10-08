# Merge to main, live folder switch and context refresh — Claude, 2026-10-08

Branch/PR: `claude/context-refresh`, PR pending (after PRs #1–#3 were merged by the user)

## Request
Get the project into `main`, update the live project folder, and update the context files so other models (GPT/Codex) understand the current system.

## Done
- PR #2 (`claude/broll-phase3`) and PR #3 (post-merge notes) merged by the user; PR #1 closed as merged with #2. The user does not give agents GitHub web access: branches were pushed with the PC's saved git credential and the user created/merged PRs; status read from the public GitHub API.
- Live folder `heygen workflow` switched from `codex/subtitle-fix` (fully inside `main`) to `main`; working tree was clean; 46/46 tests pass there; ignored runtime untouched.
- Rewrote `AGENTS.md` (agent-neutral; current B-roll rules, statuses, modules, full test command, GitHub/PR workflow, PowerShell 5.1 note), `docs/ARCHITECTURE.md` (10-step job flow, inbox import, approvals/indexes), `docs/HANDOFF.md` (current state, open findings, next steps), `docs/ROADMAP.md`; updated `README.md` (how a video is made, tests), `docs/BROLL-PLAN.md` (code location, live-folder paths), newest entries of `PROJECT.md` and `Future Vector Embedding Update.md`.

## Verified
- 46/46 Node tests in the live folder and on this branch; docs grep shows no remaining "unmerged" status.

## Not verified / limits
- Vector service not restarted (user step). No provider call, render or n8n run in this session.

## Open questions / next step
- User decisions listed in `docs/HANDOFF.md` (clip naming, Quantity picking up `needs_broll` jobs). After this PR merges, run `git pull` in the live folder.
