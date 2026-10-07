# B-roll Phase 1 — Claude, 2026-10-07

Branch/PR: `claude/broll-phase1` (worktree `..\heygen-claude-broll`, branched from `codex/subtitle-fix` at `9dd4ea9`), PR pending

## Request
User goal: all-video B-roll, generated/generic stills only in dire cases (max 2 per reel; real product photos exempt). Re-check every B-roll clip with a visible progress counter; index E: in ~20 GB local chunks so the drive is not hammered; start Phase 1. Decisions for later steps: Quality/Quantity chosen in n8n; inbox drop = approval (recorded in `docs/DECISIONS.md`).

## Done
- `vector-index/index_clips.py`: 1 frame/second (max 120 frames) in one ffmpeg pass, GPU batch embedding, index version `siglip2-base-1fps-v2`, `--progress-file`/`--label` JSON counter, default staging chunk 20 GiB. `Show-Index-Progress.cmd/.ps1` displays the counters; `Refresh-Vector-Index.cmd` writes one.
- `vector-retrieval-client.js`: phrase-based query windows (sentence/clause ends or ≥0.35 s pauses, 1.8–7 s, fragments <1 s merged); match floor `DEFAULT_MIN_MATCH_SCORE = 0.18` (`BROLL_MIN_MATCH_SCORE`); windows below it say `NO GOOD VIDEO MATCH`; accepts any asset ID shape (bug fix: clone-imported `U####` IDs were dropped).
- `vector-retrieval-service.py`: score = best mean over a 3-second window of 1 fps frames (legacy sparse indexes keep best-frame behaviour); in-point = window start.
- `local-media-catalog.js`: `keywordShortlist` fallback over approved clip names.
- `video-broll-factory.js`: `retrieveShortlist` (vector → keyword fallback with `BROLL_RETRIEVAL_WARNING`); planner never loses the video catalog; prompt states the all-video goal and still cap; `validatePlan` rejects more than `BROLL_MAX_GENERATED_STILLS` (default 2) generated stills; `plan.coverage` gains video/real-photo/generated counts and video share; `plan.retrieval` records source, no-match phrases, floor and warning; plan cache version 9.
- `broll-review-sheet.js`: `broll-contact-sheet.jpg` and `broll-review.md` per job before render (non-fatal).
- Rollback: `versions/pre-broll-phase1-2026-10-07/`; live index backup `vector-index/local-clips.pre-1fps-2026-10-07.sqlite` (ignored).

## Verified
- Calibration on the new project index (28 hand-written English queries): 17 expected matches scored 0.217–0.412 and ranked first every time; 11 no-match queries topped out at 0.163. Floor set to 0.18. Small sample; revisit as the library grows.
- Project gallery re-index: 56/56 clips, 0 errors, ~2 s/clip on the RTX 4060.
- E: `Envato Stocks`: see result below.
- `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js broll-retrieval.test.js`: 20/20 pass (includes a real ffmpeg contact-sheet test). Node and Python syntax checks pass.

## Not verified / limits
- No planner LLM call, render, n8n run, or live retrieval-service restart. The running service (if started) still uses old code from the live folder; it is compatible with the new index.
- Keyword fallback matches English clip names only; quality depends on descriptive filenames.
- Contact sheet has numbers by position only (no burned-in text); the markdown carries the details.

## Open questions / next step
- Review and merge after PR #1 and Codex's subtitle branch. Then Step 2 (fit check), Steps 3–5 (Quality/Quantity, Envato list, inbox import, n8n field).
- E: needs `chkdsk E: /f` by the user after a backup.
