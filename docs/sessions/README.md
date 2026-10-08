# Session logs

One file per agent session: `YYYY-MM-DD-<agent>-<task>.md` (for example `2026-10-07-claude-session-log-rule.md`). These are the detailed record; `docs/HANDOFF.md` is the short current state that every agent reads. Do not read every log at session start — list or grep this folder and open only the ones relevant to your task.

Keep each log short (roughly 10–40 lines). Never paste secrets, `.env` values, or long command output. Do not edit another session's log except to fix a factual error; write a new log instead.

## Template

```markdown
# <task> — <agent>, YYYY-MM-DD

Branch/PR: <branch>, <PR link or "none">

## Request
What the user asked, in one or two lines.

## Done
- Files/behaviour changed, with paths.
- Decisions made and why (especially user decisions).

## Verified
- Commands/tests that ran and their result.

## Not verified / limits
- What was not exercised (provider calls, renders, Docker, E:, etc.).

## Open questions / next step
- What the next agent should do or ask.
```
