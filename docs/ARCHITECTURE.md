# Architecture

Updated: 2026-10-08. The project root is the live source, mounted into n8n at `/files/heygen-workflow`.

## Job flow (`video-broll-factory.js`)

1. **Queue.** `runBatch` scans `incoming/`, registers new videos in `video-control.csv`, and picks rows that may run (`pending`, `failed`/`processing` with `retry=yes`, `needs_broll` when its inbox has clips or `retry=yes`). Before a `needs_broll` row runs, `importJobInbox` imports clips the user dropped in `broll-inbox/<job-id>/` (`broll-inbox-import.js`).
2. **Source.** Horizontal sources are prepared as portrait (`source-portrait.mp4`).
3. **Transcript.** ElevenLabs Scribe with word timestamps (`transcript.json`, re-used by hash).
4. **Captions.** Short cues from word timestamps → `caption-grammar.js` correction with `caption-policy.js` and `caption-glossary.json` (`captions.raw.srt`, `captions.srt`; see `docs/CAPTIONS.md`).
5. **Search.** `vector-retrieval-client.js` splits speech into phrases (1.8–7 s), the text LLM translates each into a short English visual description, and the local service (`vector-retrieval-service.py`, `/search`) ranks **approved** clips by 1 fps frame vectors over 3 s windows (0.7 visual + 0.1 title + 0.2 keyword overlap). Below 0.18 a phrase shows `NO GOOD VIDEO MATCH`. If the service is down, `local-media-catalog.js` gives a keyword shortlist.
6. **Plan.** The LLM returns shots (`stock_video`, `product`, `social`, `hospital`, `generated_image`) and `missing_beats` (important moments with no fitting video). `validatePlan` enforces approvals, anchors, timing, uniqueness and the 2-still cap; `speech-duration-planner.js` sets durations.
7. **Fit check.** `broll-fit-check.js` sends every video shot to `/verify`, which scores the exact seconds it will show against its spoken phrase and returns: kept, moved (better in-point), swapped (better unused approved clip), dropped (presenter stays), or weak.
8. **Mode.** `broll-mode.js` lists missing moments (dropped/weak shots, generated stills, uncovered planner beats) and writes `envato-needed.md/.json`. **Quality** with missing moments stops here: tracker `needs_broll`, `broll-inbox/<job-id>/README.txt`, no image or render cost. **Quantity** continues.
9. **Assets and review.** Local media resolve through `local-media-catalog.js`; only `generated_image` calls the image provider. `broll-review-sheet.js` writes `broll-contact-sheet.jpg` and `broll-review.md`.
10. **Render.** `render-mixed-broll.js` composites presenter, B-roll, captions and phone overlay with FFmpeg and verifies 1080×1920 and duration. `broll-usage-ledger.js` records clip use across reels.

The result is printed as `BATCH_RESULT=<json>`; `needs_broll` counts as ok. `video-broll-factory-workflow.json` (n8n, schedule inactive) passes `broll_mode` from its Set node and turns the result into a plain-English `summary`.

## Inbox import (`broll-inbox-import.js`)

Waits for files still being copied; checks the video header, ffprobe readability and ≥ 2.5 s; rejects SHA-256 duplicates of the library; makes a verified copy in `broll-assets/inbox/<job-id>/`; adds an `E####` ID to `broll-assets/local-asset-map.json` and `local-approved-stock-ids.json`; appends `broll-assets/approval-log.jsonl`; moves the user's file to `imported/` or `rejected/` (with a reason). Environment errors leave the file in place. Then the catalog reloads, the service's `/refresh` indexes the new clips, and the changed approval fingerprint forces a re-plan.

## Media, approvals and indexes

- Approved stock: `approved-stock-ids.json` + `broll-assets/asset-map.json`, plus ignored local overlays (`local-approved-stock-ids.json`, `broll-assets/local-asset-map.json`) written by the clone bootstrap and the inbox importer. Indexed ≠ approved.
- Indexes (ignored): `vector-index/local-clips.sqlite` (project gallery); `runtime/vector-cache/index/envato-1fps.sqlite` and `panchkarma-1fps.sqlite` (E: drive, unapproved). `vector-index/index_clips.py` builds them (GPU when available, staged copies from slow drives, skips damaged files).
- Products: `product-assets/catalog.json` (exact P-numbers). References: `reference-assets/` (YouTube/Facebook profile, HIIMS hospital).

## Other parts

- `publishing/` is a separate draft-and-approve workflow; rendering never authorizes posting.
- `runtime/n8n/` holds Docker Compose and private runtime state; `Start-Heygen.ps1` starts services after portable setup. `Bootstrap-From-Git.ps1` + `runtime/clone/` set up a fresh clone (Docker n8n, optional CPU vector service).
- Git tracks code, catalogs, rules and docs; `.gitignore` excludes credentials, tracker, runtime, media and outputs. `versions/` holds rollback snapshots; edit root files, not snapshots.
- Legacy Gemini provider paths still exist in `plannerSettings`/`imageSettings`; the user forbids Gemini (see `AGENTS.md`).
