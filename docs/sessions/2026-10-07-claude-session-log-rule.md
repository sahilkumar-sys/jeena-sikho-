# Session log rule — Claude, 2026-10-07

Branch/PR: `claude/session-log-rule` (branched from `codex/multi-agent-setup`), no PR yet

## Request
User asked for a rule that every LLM records what it did so other agents get context, and whether that wastes tokens.

## Done
- Added a three-tier context rule to `AGENTS.md`: short rewritten `docs/HANDOFF.md` (always read), per-session logs in `docs/sessions/` (read on demand), and `PROJECT.md` / `Future Vector Embedding Update.md` entries only for material milestones.
- Added `docs/sessions/README.md` with naming and template.
- Condensed six near-duplicate 7 October entries at the top of `PROJECT.md` and `Future Vector Embedding Update.md` into one consolidated entry each (all facts kept: branches, PR #1, public repo authorization, 403 history, clone bootstrap, verification limits, open OpenAI Images question). Sourcing-order entries unchanged. Updated `docs/ROADMAP.md`.
- Reason: the start-up read is the token cost. `PROJECT.md` (~48 KB) and `Future Vector Embedding Update.md` (~42 KB) already carried several near-duplicate same-day status entries.

## Verified
- Documentation only; no code, tests, media, tracker, n8n, or provider touched.

## Not verified / limits
- Nothing executed beyond git; docs only.

## Open questions / next step
- Review this PR after PR #1 (it is stacked on `codex/multi-agent-setup`). Every future agent should write a log here at session end.
