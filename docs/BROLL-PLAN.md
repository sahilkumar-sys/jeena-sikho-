# B-roll plan and phase status

Updated: 2026-10-08 (Asia/Kolkata). Phases 1–5 were built by Claude and merged into `main` on 8 Oct (PR #2). How the pieces fit: `docs/ARCHITECTURE.md`.

## Where the code is

- All B-roll code is in `main`; the live folder `C:\Users\js19187\Desktop\heygen workflow` is on `main` (switched 8 Oct). Restart `Start-Vector-Retrieval.cmd` once so the running service has `/verify` and `/refresh`.
- Ignored runtime (Python venv, SigLIP2 model, indexes, media, logs) lives only in the live folder. When working in a separate worktree, point scripts at the live folder's runtime (examples below).

## User decisions (binding; also in `docs/DECISIONS.md`)

1. Goal: 100% video B-roll. Generated/generic stills only in dire cases, **max 2 per reel**. Exact real photos (named product pack, YouTube/Facebook profile, HIIMS hospital) do **not** count.
2. If nothing fits, the presenter stays on screen rather than a weak visual.
3. The user picks **Quality** or **Quantity** per run **in n8n**.
4. A clip the user drops in a job's inbox **counts as approval** (licence + people check done by the user). Record provenance.
5. E: is read only. `All panchkarma therepy` stays excluded from ordinary E: runs but is indexed on its own into `panchkarma-1fps.sqlite` at user request. Indexed ≠ approved.
6. Explain to the user in plain, simple English; they like short summaries (they forward WhatsApp-style updates).
7. Quality mode: only **important** moments count as missing (planner-listed, plus fit-check dropped/weak shots); greetings/filler never stop a video. Generated stills are **not** accepted in Quality; that moment goes on the Envato list (run in Quantity to render with a still).

## Phase status

| Phase | Status | Key files |
|---|---|---|
| 1 Better search | Done, merged | `vector-index/index_clips.py`, `vector-retrieval-client.js`, `vector-retrieval-service.py`, `local-media-catalog.js`, `video-broll-factory.js`, `broll-review-sheet.js`, `Show-Index-Progress.*` |
| 2 Fit check | Done, merged | service `/verify`, `broll-fit-check.js`, `applyFitCheck` in factory |
| 3 Quality/Quantity | Done, merged | `broll-mode.js`, `finishJob` in factory, n8n Set node |
| 4 Inbox import | Done, merged | `broll-inbox-import.js`, service `/refresh`, `importJobInbox` in factory |
| 5 n8n report | Done, merged | `video-broll-factory-workflow.json`, `n8n-workflow.test.js` |
| Open finding | needs user decision | non-descriptive clip names (`c4`, Panchakarma `C0166`) lose the keyword/title share of the score and fall below 0.18 even when they fit (`docs/sessions/2026-10-07-claude-broll-e2e-test.md`) |
| Next | — | switch the live folder to `main` (with Codex idle) + restart vector service; one authorized non-Gemini Quality-mode sample; resume Panchakarma after the drive is checked; approve E:/Panchakarma candidates; existing-still search; remove stale provider defaults in `plannerSettings` |

Details: `docs/sessions/2026-10-07-claude-broll-phase1.md`, `...-phase2-fit-check.md`, `...-phase3-5.md`.

### Phase 1–2 facts a new agent needs

- Index version `siglip2-base-1fps-v2` (1 fps, ≤120 frames). Project DB `vector-index/local-clips.sqlite` (56/56; old index backup `local-clips.pre-1fps-2026-10-07.sqlite`). E: DB `runtime/vector-cache/index/envato-1fps.sqlite` (246/247). Panchakarma DB `runtime/vector-cache/index/panchkarma-1fps.sqlite` (326/1305, stopped; see below).
- Score = 0.7 × mean frame score over a shot window + 0.1 title + 0.2 keyword overlap. Match floor `BROLL_MIN_MATCH_SCORE` = 0.18 (28-query calibration: matches 0.217–0.412, non-matches ≤ 0.163). Drop floor `BROLL_DROP_BELOW_SCORE` = 0.14. Still cap `BROLL_MAX_GENERATED_STILLS` = 2.
- Fit-check actions per video shot: `kept`, `moved` (in-point), `swapped` (asset), `dropped`, `weak`, `not_indexed`. Stored in `plan.fit_check` (details carry start/duration/anchor) and each image's `fit`; shown in `broll-review.md`.
- `plan.coverage` has `video_shots`, `real_photo_shots`, `generated_still_shots`, `video_share_of_broll`. `plan.retrieval` has `source` (`vector`/`keyword`/`none`), `no_match_phrases`, `warning`, `queries` (English meaning per phrase). Plan cache version 11.
- Log markers: `BROLL_RETRIEVAL_WARNING`, `BROLL_FIT_CHECK`, `BROLL_FIT_CHECK_WARNING`, `BROLL_REVIEW`, `BROLL_REVIEW_WARNING`, `BROLL_ENVATO_NEEDED`, `BROLL_NEEDS_CLIPS`, `BROLL_INBOX_IMPORTED`, `BROLL_INBOX_REJECTED`, `BROLL_INBOX_DEFERRED`.
- Tests: `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js broll-retrieval.test.js broll-fit-check.test.js broll-mode.test.js broll-inbox-import.test.js n8n-workflow.test.js` (45 pass; CI runs them).
- Not verified anywhere yet: a real planner LLM call (including the new `missing_beats` field), a full render, an n8n run. The legacy `.env` is Gemini-configured: do not run providers with it (see `AGENTS.md`).

### Phase 3 — Quality / Quantity (as built)

- Mode: CLI `--broll-mode` > `BROLL_MODE` > default `quantity`; a typo fails the run before any job. n8n Set node field `broll_mode` (default `quantity`) is passed as one quoted argument.
- Missing beat (user decision, `docs/DECISIONS.md`): a fit-check `dropped`/`weak` shot, a `generated_image`, or a planner `missing_beats` entry (important moment, no fitting approved video) not covered by a shot; reports of the same moment within 1 s merge. Greetings/filler never count. The planner prompt asks for `missing_beats`; `validatePlan` keeps valid entries and silently drops malformed ones.
- Both modes write `processed/<job>/envato-needed.md/.json` when beats exist (time, spoken Hindi words, what to show, Envato search terms, minimum length, orientation note) and delete a stale list when none.
- **Quality** with beats: stops before image generation and render; result `status: 'needs_broll'`; tracker `status=needs_broll`, `stage=needs_broll`, note in `error_message` (no new CSV column); creates `broll-inbox/<job-id>/README.txt`. Generated stills are not accepted. If the plan's fit check was skipped, Quality re-runs it and fails clearly when the vector service is still down.
- A `needs_broll` row is selected again only when its inbox has video files or `retry=yes`. The plan does not depend on the mode, so re-running in Quantity re-uses the saved plan.
- **Quantity**: rendering unchanged; the list is marked optional.

### Phase 4 — inbox import (as built)

- Before processing a `needs_broll` row: `importJobInbox` → `broll-inbox-import.js` for top-level video files in `broll-inbox/<job-id>/`. Files modified less than `BROLL_INBOX_MIN_AGE_SECONDS` (30) ago wait. Checks: video header, ffprobe picture stream, ≥ 2.5 s, SHA-256 not in `approval-log.jsonl` or any same-size library file. Verified copy to `broll-assets/inbox/<job-id>/<safe-name>`; next `E####` ID into `broll-assets/local-asset-map.json` and `local-approved-stock-ids.json`; provenance line in `broll-assets/approval-log.jsonl`; user's file → `imported/`. Content problems → `rejected/` + `.reason.txt`; environment errors leave the file in place.
- Then `localMedia.reload()` and `POST /refresh` on the vector service (runs `index_clips.py` on `broll-assets/`, swaps the clip snapshot). A refresh failure is only a warning; the clip is still approved. The plan key's approval fingerprint changes, so the job is re-planned.
- All three new paths are git-ignored.

### Phase 5 — n8n report (as built)

- "Report factory result" still throws on real failures; `needs_broll` is ok. It adds `summary` text: rendered videos + B-roll mix + optional list; not-rendered videos + list path + inbox + each moment with an Envato search phrase; inbox import results; other waiting jobs (`report.waiting_for_broll`). Schedule still inactive. Checked statically (`n8n-workflow.test.js` runs the node code); n8n itself was not run.

## Indexing runs and how to resume

- Watch progress: `powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "C:\Users\js19187\Desktop\heygen workflow\Show-Index-Progress.ps1" -ProjectRoot "C:\Users\js19187\Desktop\heygen workflow"`. Progress JSON: `runtime\vector-cache\logs\progress-*.json`; console log `runtime\vector-cache\logs\panchkarma-console.log`.
- The Panchakarma run was started from a chat session and may stop when that session ends. It is resumable (finished clips are kept, leftover staging is cleaned). Resume from PowerShell:
  `$L='C:\Users\js19187\Desktop\heygen workflow'; $env:HF_HOME="$L\runtime\vector-cache\models"; $env:HF_HUB_OFFLINE='1'; $env:TRANSFORMERS_OFFLINE='1'; $env:PYTHONUTF8='1'; & "$L\runtime\vector-cache\venv\Scripts\python.exe" "$L\vector-index\index_clips.py" --root 'E:\Envato Stocks\All panchkarma therepy' --db "$L\runtime\vector-cache\index\panchkarma-1fps.sqlite" --ffmpeg "$L\runtime\tools\ffmpeg.exe" --ffprobe "$L\runtime\tools\ffprobe.exe" --stage-dir "$L\runtime\vector-cache\stage" --stage-max-gib 20 --progress-file "$L\runtime\vector-cache\logs\progress-panchkarma.json" --label 'E: Panchakarma therapy' *>> "$L\runtime\vector-cache\logs\panchkarma-console.log"`
- **Panchakarma status (16:11, 7 Oct): 326/1305 indexed, then the E: drive stopped responding.** Windows logged a disk I/O retry and a USB device reset (`UASPStor` 129, `disk` 153); afterwards even 12-byte header reads failed with "I/O device error", and 957 copies failed with `[Errno 22]`. Those clips are not lost from the index plan: errored rows are retried on the next run. In the index DB, 22 files are genuinely damaged (21 zero-filled with no video header, 1 undecodable: `greeva vasti\augest\C0276.MP4`); the list was given to the user.
- **Do not resume until the user has checked the drive.** The indexer now stops by itself after 8 consecutive OS read errors (`SOURCE_FAILURE_LIMIT`) and writes state `stopped: source drive not responding`.
- E: health: exFAT "Full Repair Needed"/dirty **and now hardware/connection-level I/O errors**. Advice given to the user: stop using E:, reconnect it on a different USB port/cable (rear port, no hub), check its health (SMART, e.g. CrystalDiskInfo), and **copy irreplaceable data off before running `chkdsk E: /f`**, because chkdsk on failing hardware can make things worse. Agents never write to E:.

## Environment notes

- The Claude desktop Terminal panel failed to start (missing `claude-desktop.ps1` shell integration); run long jobs as background commands and give the user the progress-viewer command.
- GPU: RTX 4060 (CUDA works in the vector venv). Python is not on PATH; use `runtime\vector-cache\venv\Scripts\python.exe`.
- Other agents (Codex) may work in the live folder concurrently; make code changes on a new branch in a separate worktree and merge through a PR.
