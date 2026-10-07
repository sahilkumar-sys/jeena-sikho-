# Roadmap

Updated: 2026-10-07

## Completed

- Initialized local Git history with a source-only first commit on `main`.
- Added agent branch/worktree rules, short architecture and handoff docs, and PR test automation.
- Connected local `origin` to the user-supplied empty GitHub repository; no branches have been pushed.

## Next

- Resolve GitHub HTTP 403 by granting `shaluji1111` write access or signing this PC into an account with access. Then publish both local branches to the user-authorized public repository and review `codex/multi-agent-setup` through a PR before merging.
- Build and verify an explicitly non-Gemini production provider path before any full automated run. The current live v7.1 runner still has Gemini-configured paths.
- Implement and validate the full B-roll sourcing order recorded at the top of `PROJECT.md` and `Future Vector Embedding Update.md`. Confirm rights and frame fit before approving new assets.
- Decide whether a controlled shared media store is needed for collaborators; Git deliberately excludes large licensed/private media and local runtime state.
