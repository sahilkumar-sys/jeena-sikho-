# B-roll Phase 2 fit check — Claude, 2026-10-07

Branch/PR: `claude/broll-phase1` (same worktree `..\heygen-claude-broll`; Phase 2 commits on top of Phase 1), PR pending

## Request
Start Phase 2: before rendering, check that the exact seconds of each chosen video shot fit what is being said, and fix weak picks.

## Done
- `vector-retrieval-service.py`: new `/verify` endpoint. Uses stored 1 fps frame vectors (no video decoding): scores the frames the shot will actually show (`window_at`), the best shot-length window in the same clip, and the best other approved clips (excluding clips already in the reel). Same 0.7 visual / 0.1 title / 0.2 keyword blend as search (`blended`). `best_window` takes the shot length.
- `vector-retrieval-client.js`: `verifyShots()`.
- `broll-fit-check.js`: per video shot — keep (≥ 0.18, no clearly better part), move in-point (best part ≥ 0.03 better, or the only part above 0.18), swap to the best unused approved clip ≥ 0.18, drop when everything is below 0.14 (`BROLL_DROP_BELOW_SCORE`) so the presenter stays on screen, otherwise keep the best part flagged `weak`. Never drops the last shot. Real photos and generated stills are not touched.
- `video-broll-factory.js`: `applyFitCheck` runs after a valid plan, re-validates, records `plan.fit_check` (counts + per-shot details); on any error or when the vector service is down it keeps the unchecked plan and logs `BROLL_FIT_CHECK_WARNING`. Placements carry `fit`; plan cache version 10.
- `broll-review.md` gains a Fit column and a fit summary line.

## Verified
- 25/25 Node tests (`broll-fit-check.test.js` covers keep/move/swap/drop/weak/not-indexed/no-video).
- Live check: new service on test port 8767 against the real 1 fps project index; a deliberately imperfect 5-shot plan took 311 ms: heron, monkey, eye kept (0.33–0.41); "pulling a carrot out of the soil" swapped B054 (growing, 0.16) → B056 (harvesting, 0.30, in-point 3 s); "elderly man with knee pain" on a lightning clip (0.05) dropped. Test service stopped afterwards.

## Not verified / limits
- No planner LLM call or render; the fit check has not run inside a full factory job. The live service on 8766 still runs old code (no `/verify`), so until merge + `Start-Vector-Retrieval.cmd` restart the factory logs a fit-check warning and keeps the unchecked plan.
- Thresholds 0.18/0.14 come from 28 hand-written queries; LLM-translated Hindi phrases may score differently. Abstract topics (acidity, stress) are hard for any image model.

## Open questions / next step
- Phase 3: Quality/Quantity mode in n8n (Quality treats `weak`/dropped beats as missing and stops with an Envato list).
- Panchakarma index run: about 12% of files in the first chunk are damaged on E: (start with zero bytes, no `ftyp` header); originals need a backup source or `chkdsk`.
