# Roadmap

Updated: 2026-10-07

## Completed

- Initialized local Git history with a source-only first commit on `main`.
- Added agent branch/worktree rules, short architecture and handoff docs, and PR test automation.

## Next

- Review this branch through a PR after connecting a private remote; merge only after review.
- Build and verify an explicitly non-Gemini production provider path before any full automated run. The current live v7.1 runner still has Gemini-configured paths.
- Implement and validate the full B-roll sourcing order recorded at the top of `PROJECT.md` and `Future Vector Embedding Update.md`. Confirm rights and frame fit before approving new assets.
- Decide whether a controlled shared media store is needed for collaborators; Git deliberately excludes large licensed/private media and local runtime state.
