# Session log rule — Claude, 2026-10-07

Branch/PR: `claude/session-log-rule` (branched from `codex/multi-agent-setup`), no PR yet

## Request
User asked for a rule that every LLM records what it did so other agents get context, and whether that wastes tokens.

## Done
- Added a three-tier context rule to `AGENTS.md`: short rewritten `docs/HANDOFF.md` (always read), per-session logs in `docs/sessions/` (read on demand), and `PROJECT.md` / `Future Vector Embedding Update.md` entries only for material milestones.
- Added `docs/sessions/README.md` with naming and template.
- Reason: the start-up read is the token cost. `PROJECT.md` (~48 KB) and `Future Vector Embedding Update.md` (~42 KB) already carried several near-duplicate same-day status entries.

## Verified
- Documentation only; no code, tests, media, tracker, n8n, or provider touched.

## Not verified / limits
- Existing duplicate entries in `PROJECT.md` / `Future Vector Embedding Update.md` were not condensed.

## Open questions / next step
- Review and merge after PR #1. Optionally condense today's duplicate history entries into one.
