# B-roll plan and phase status

Updated: 2026-10-07 (Asia/Kolkata). Owner of Phases 1–2: Claude, branch `claude/broll-phase1`.

## Where the code is

- Branch `claude/broll-phase1`, checked out in the separate worktree `C:\Users\js19187\Desktop\heygen-claude-broll` (sibling of the live folder). It is `codex/subtitle-fix` + B-roll commits; the live folder `heygen workflow` is on `codex/subtitle-fix` and does **not** contain this work yet.
- Ignored runtime (Python venv, SigLIP2 model, indexes, media, logs) lives only in the live folder `C:\Users\js19187\Desktop\heygen workflow`. Run scripts from the worktree with paths pointing at the live folder (examples below).
- Not pushed to GitHub (pushing would also publish Codex's unpushed `codex/subtitle-fix`). Merge order: PR #1 `codex/multi-agent-setup` → `claude/session-log-rule` → `codex/subtitle-fix` → `claude/broll-phase1`. After merge, restart `Start-Vector-Retrieval.cmd` so the service has `/verify`.

## User decisions (binding; also in `docs/DECISIONS.md`)

1. Goal: 100% video B-roll. Generated/generic stills only in dire cases, **max 2 per reel**. Exact real photos (named product pack, YouTube/Facebook profile, HIIMS hospital) do **not** count.
2. If nothing fits, the presenter stays on screen rather than a weak visual.
3. The user picks **Quality** or **Quantity** per run **in n8n**.
4. A clip the user drops in a job's inbox **counts as approval** (licence + people check done by the user). Record provenance.
5. E: is read only. `All panchkarma therepy` stays excluded from ordinary E: runs but is indexed on its own into `panchkarma-1fps.sqlite` at user request. Indexed ≠ approved.
6. Explain to the user in plain, simple English; they like short summaries (they forward WhatsApp-style updates).

## Phase status

| Phase | Status | Key files |
|---|---|---|
| 1 Better search | Done, unmerged | `vector-index/index_clips.py`, `vector-retrieval-client.js`, `vector-retrieval-service.py`, `local-media-catalog.js`, `video-broll-factory.js`, `broll-review-sheet.js`, `Show-Index-Progress.*` |
| 2 Fit check | Done, unmerged | service `/verify`, `broll-fit-check.js`, `applyFitCheck` in factory |
| 3 Quality/Quantity | **Next** | factory, tracker status, n8n workflow JSON |
| 4 Inbox import | Next after 3 | new module + catalog/approval files + indexer |
| 5 n8n report polish | After 4 | `video-broll-factory-workflow.json` |
| Later | — | approve E:/Panchakarma candidates, existing-still search, remove stale provider defaults in `plannerSettings` |

Details of what was built and verified: `docs/sessions/2026-10-07-claude-broll-phase1.md`, `docs/sessions/2026-10-07-claude-broll-phase2-fit-check.md`.

### Phase 1–2 facts a new agent needs

- Index version `siglip2-base-1fps-v2` (1 fps, ≤120 frames). Project DB `vector-index/local-clips.sqlite` (56/56; old index backup `local-clips.pre-1fps-2026-10-07.sqlite`). E: DB `runtime/vector-cache/index/envato-1fps.sqlite` (246/247). Panchakarma DB `runtime/vector-cache/index/panchkarma-1fps.sqlite` (in progress).
- Score = 0.7 × mean frame score over a shot window + 0.1 title + 0.2 keyword overlap. Match floor `BROLL_MIN_MATCH_SCORE` = 0.18 (28-query calibration: matches 0.217–0.412, non-matches ≤ 0.163). Drop floor `BROLL_DROP_BELOW_SCORE` = 0.14. Still cap `BROLL_MAX_GENERATED_STILLS` = 2.
- Fit-check actions per video shot: `kept`, `moved` (in-point), `swapped` (asset), `dropped`, `weak`, `not_indexed`. Stored in `plan.fit_check` and each image's `fit`; shown in `broll-review.md`.
- `plan.coverage` has `video_shots`, `real_photo_shots`, `generated_still_shots`, `video_share_of_broll`. `plan.retrieval` has `source` (`vector`/`keyword`/`none`), `no_match_phrases`, `warning`. Plan cache version 10.
- Log markers: `BROLL_RETRIEVAL_WARNING`, `BROLL_FIT_CHECK`, `BROLL_FIT_CHECK_WARNING`, `BROLL_REVIEW`, `BROLL_REVIEW_WARNING`.
- Tests: `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js broll-retrieval.test.js broll-fit-check.test.js` (25 pass).
- Not verified anywhere yet: a real planner LLM call, a full render, an n8n run. The legacy `.env` is Gemini-configured: do not run providers with it (see `AGENTS.md`).

## Phase 3 spec — Quality / Quantity mode

- Setting: `BROLL_MODE` env + CLI `--broll-mode quality|quantity`; n8n "Set factory inputs" node gets a `broll_mode` field passed to the Execute Command (keep the existing shell-quoting pattern). Default `quantity` (current always-render behaviour). Include the mode in the plan cache key.
- A beat is "missing" when a phrase had `NO GOOD VIDEO MATCH`, or a fit-check shot is `dropped`/`weak`, or the plan uses a generated still for it. Decide the exact rule with the user if unclear; generated stills within the cap are allowed in Quantity, and in Quality only when the user accepts them (ask).
- **Quality**: after planning + fit check and before image generation/render, if any beat is missing → do not render; set the tracker row status to `needs_broll` (new status value, no new CSV column — ask before adding columns) with a short error/notes text; write `processed/<job>/envato-needed.md` (and `.json`): time range, Hindi phrase, English meaning, suggested Envato search terms (from the English visual query), needed length, orientation note; create `broll-inbox/<job-id>/` with a README. `--report-json` result must report `needs_broll` distinctly (not `failed`). A later run re-checks that job when its inbox has new files.
- **Quantity**: always render: best approved video above the drop floor → up to 2 generated stills → presenter. Write the same list as `envato-needed.md` marked optional.
- Rules for both: never unapproved clips, never reuse an asset in a reel, never fake product shots, still cap.
- Tests: mode parsing, missing-beat detection, `needs_broll` status write, report JSON shape, no render call in Quality when missing (stub render/image functions).

## Phase 4 spec — inbox import

- On each run before planning a `needs_broll` job: scan `broll-inbox/<job-id>/` for video files. For each: header check (`check_video_header` logic), ffprobe readable, duration ≥ 2.5 s, SHA-256 not already in the library (dedupe against `broll-assets/` files), then copy (never move the user's file until verified) into `broll-assets/inbox/<job-id>/`, add an ID to `broll-assets/local-asset-map.json` and `local-approved-stock-ids.json` (existing ignored overlay files read by `local-media-catalog.js` and the service), and append provenance to a new ignored `broll-assets/approval-log.jsonl` (`asset_id, file, sha256, source: "envato-inbox", job, approved_at, approved_by: "user inbox drop"`).
- Re-index only the new files (`index_clips.py` already skips unchanged clips) and restart/refresh the vector service (it loads a snapshot at start; add a reload endpoint or restart).
- Then re-plan that job (plan cache key already hashes the local approval/map files).
- Tests with temp folders: valid import, duplicate rejected, damaged header rejected, provenance written, job re-planned.

## Phase 5 spec — n8n

- `video-broll-factory-workflow.json`: `broll_mode` in the Set node; "Report factory result" treats `needs_broll` as a non-error result and outputs the Envato list path/summary. Keep the schedule **inactive**. Docker Linux engine was unavailable here: validate the JSON statically and say so.

## Indexing runs and how to resume

- Watch progress: `powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "C:\Users\js19187\Desktop\heygen-claude-broll\Show-Index-Progress.ps1" -ProjectRoot "C:\Users\js19187\Desktop\heygen workflow"`. Progress JSON: `runtime\vector-cache\logs\progress-*.json`; console log `runtime\vector-cache\logs\panchkarma-console.log`.
- The Panchakarma run was started from a chat session and may stop when that session ends. It is resumable (finished clips are kept, leftover staging is cleaned). Resume from PowerShell:
  `$L='C:\Users\js19187\Desktop\heygen workflow'; $env:HF_HOME="$L\runtime\vector-cache\models"; $env:HF_HUB_OFFLINE='1'; $env:TRANSFORMERS_OFFLINE='1'; $env:PYTHONUTF8='1'; & "$L\runtime\vector-cache\venv\Scripts\python.exe" 'C:\Users\js19187\Desktop\heygen-claude-broll\vector-index\index_clips.py' --root 'E:\Envato Stocks\All panchkarma therepy' --db "$L\runtime\vector-cache\index\panchkarma-1fps.sqlite" --ffmpeg "$L\runtime\tools\ffmpeg.exe" --ffprobe "$L\runtime\tools\ffprobe.exe" --stage-dir "$L\runtime\vector-cache\stage" --stage-max-gib 20 --progress-file "$L\runtime\vector-cache\logs\progress-panchkarma.json" --label 'E: Panchakarma therapy' *>> "$L\runtime\vector-cache\logs\panchkarma-console.log"`
- **Panchakarma status (16:11, 7 Oct): 326/1305 indexed, then the E: drive stopped responding.** Windows logged a disk I/O retry and a USB device reset (`UASPStor` 129, `disk` 153); afterwards even 12-byte header reads failed with "I/O device error", and 957 copies failed with `[Errno 22]`. Those clips are not lost from the index plan: errored rows are retried on the next run. 56 more files are zero-filled/no `moov` (genuinely damaged content).
- **Do not resume until the user has checked the drive.** The indexer now stops by itself after 8 consecutive OS read errors (`SOURCE_FAILURE_LIMIT`) and writes state `stopped: source drive not responding`.
- E: health: exFAT "Full Repair Needed"/dirty **and now hardware/connection-level I/O errors**. Advice given to the user: stop using E:, reconnect it on a different USB port/cable (rear port, no hub), check its health (SMART, e.g. CrystalDiskInfo), and **copy irreplaceable data off before running `chkdsk E: /f`**, because chkdsk on failing hardware can make things worse. Agents never write to E:.

## Environment notes

- The Claude desktop Terminal panel failed to start (missing `claude-desktop.ps1` shell integration); run long jobs as background commands and give the user the progress-viewer command.
- GPU: RTX 4060 (CUDA works in the vector venv). Python is not on PATH; use `runtime\vector-cache\venv\Scripts\python.exe`.
- Codex works in the live folder concurrently; do B-roll work only in the worktree/branch above.
