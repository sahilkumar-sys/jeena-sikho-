# Handoff

Updated: 2026-10-08 (Asia/Kolkata). Current state only; details are in the linked session logs.

## Where things are

- `main` on GitHub (`sahilkumar-sys/jeena-sikho-`, public) contains everything: clone bootstrap (PR #1), session-log rule, subtitle fixes, and B-roll Phases 1–5 (PR #2), merged 8 Oct 2026. PR #3 recorded the merge. No open PRs.
- The live folder `C:\Users\js19187\Desktop\heygen workflow` was switched to `main` on 8 Oct (it was on `codex/subtitle-fix`, which is fully inside `main`). 46/46 Node tests pass there. Its ignored runtime (venv, model, indexes, media, tracker, `.env`) is unchanged.
- Old branches/worktrees kept for reference, all merged: `claude/broll-phase1` (`..\heygen-claude-broll`), `claude/broll-phase3` / `claude/context-refresh` (`..\heygen-claude-broll-phase3`), `codex/*`. Start new work from `main` on a new branch.

## Before the first real run with the new code

1. Restart `Start-Vector-Retrieval.cmd` so the live search service has `/verify` and `/refresh` (it was not running on 8 Oct). Without it, search falls back to keywords, the fit check is skipped and Quality mode stops with a clear error.
2. Run one isolated sample with an **authorized non-Gemini** text provider (planner, phrase translation, caption proofreading). Not yet verified: a real planner call (including `missing_beats`), real caption proofreading, an n8n run in Docker.
3. Keep the n8n schedule inactive until that sample is approved. The legacy `runtime/n8n/.env` is Gemini-configured: do not run providers with it.

## B-roll (see `docs/BROLL-PLAN.md`, `docs/DECISIONS.md`)

- User decisions: goal 100% video B-roll; at most 2 generated stills per reel (real product/social/hospital photos exempt); presenter rather than a weak visual; Quality/Quantity chosen per run in n8n (`broll_mode`, default quantity); a clip dropped in `broll-inbox/<job-id>/` counts as approval; in Quality only important moments count and generated stills are not accepted.
- Built: 1 fps search with 0.18 match floor, fit check (`/verify`), Quality stop with `needs_broll` + `envato-needed.md`, inbox import with provenance + `/refresh` + re-plan, n8n plain-English summary. Fixes from testing: fit-check phrase boundary, untagged 10-bit ProRes clips (FFmpeg 8), PowerShell 5.1 approval-list corruption in clone imports.
- Example (8 Oct, isolated, Claude standing in for the text AI): diabetes video with the user's labelled clips `Downloads\s\b rolls\d1–d7`. Quality stopped for 2 weak clips (donuts 0.151, sugar 0.156); Quantity rendered `Downloads\s\rendered videos\diabetes-example-claude-2026-10-08.mp4` (1080×1920, 50.92 s). Captions were raw (no proofreading). Log: `docs/sessions/2026-10-08-claude-broll-diabetes-example.md`.
- Open findings (need user decisions or follow-up):
  - Non-descriptive clip names (`c4`, `d5`, Panchakarma `C0166`) score about a third lower; true matches fall below 0.18. Options: keep Envato names, auto-label inbox clips with the moment they fit, or a picture-only floor. Descriptive names raised the user's clips from ~0.12 to 0.23–0.35.
  - One phrase window can hold two ideas (vegetables + sugar); the fit check judges both shots against one description. Fix idea: split long sentences at conjunctions before translation.
  - Should Quantity runs pick up `needs_broll` jobs automatically? Today they need `retry=yes`.
- The user's other labelled clip sets in `Downloads\s\b rolls` (a = asthma, b = blood pressure, c = constipation, f = fatty liver) follow Codex's list `Documents\Codex\2026-10-05\c-users-js19187-downloads-avatar-video\outputs\eight-video-broll-shot-list.md`; saved ElevenLabs transcripts for those four videos plus diabetes are in `Documents\Codex\2026-10-05\c-users-js19187-downloads-avatar-video\work\` (`asthma\`, `five-renders\<topic>\`).

## Indexes and the E: drive

- Project gallery index 56/56 at 1 fps. E: `Envato Stocks` 246/247 (unapproved). Panchakarma 326/1305 then **the E: drive failed** (USB reset, I/O errors, 7 Oct); 22 files there are genuinely damaged. Do not scan E: or resume until the user confirms the drive is checked and backed up. Resume command: `docs/BROLL-PLAN.md`.

## Captions

- Subtitle fixes are in `main` (titles kept with names, contextual `Pa`/`Ma` spellings, punctuation, faithful-correction checks; cache version 3). 23 older finished caption files match raw output and were not re-done; finished videos are not re-rendered automatically. Rules: `docs/CAPTIONS.md`.

## Boundaries

- No Gemini. Never print `.env` values. E: is read-only. Rendering never authorizes posting (`publishing/` needs per-video approval). Docker's Linux engine was unavailable on this PC, so the clone Docker path and n8n runs remain unverified here.
