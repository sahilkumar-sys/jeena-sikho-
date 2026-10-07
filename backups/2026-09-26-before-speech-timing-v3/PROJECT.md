# HN Video Factory — project context

Last updated: 2026-09-25 (Asia/Kolkata). This is a handoff snapshot for a new chat or AI tool. Check the live files and service state before making changes. Never copy API key or access token values into a chat, issue, or ZIP.

## Current visual rules and three v2 re-edits

The user supplied examples of broken Hindi matras; these are examples, not a finite correction list. Captions now normalize Unicode, strip invisible joiners, and use the bundled OFL-licensed Tiro Devanagari Sanskrit font in `ayurveda-subtitles-tiro-amber.ass`. Check actual caption wording against the speech as well as the glyph rendering during review.

Each B-roll shot lasts up to 1.8 seconds. Shot starts rotate 4.1, 4.5, 4.2 and 4.6 second intervals so presenter-only gaps stay between 2 and 5 seconds. The ten restrained transitions rotate in order: fade, wipeleft, slideright, circleopen, dissolve, wiperight, slideleft, circleclose, wipeup, slidedown. The LLM planner should select a visual for the exact speech moment, prefer closely matching local stock video, and use a still or generated image when stock footage is less relevant. People who look Indian have priority when a human visual fits, but semantic relevance remains decisive. Shot manifests record source IDs and nearby speech for review.

`product-assets/JeenaSikho_Products.xlsx` is the supplied workbook. `product-assets/catalog.json` and `product-assets/images/` contain its 505 entries and embedded images. `product-assets/hires/` holds high resolution Dr. Maa, Dr. Paa and Dr. Maa-Paa packshots for the test edits. Match a named product to its catalog image and show it when that product is discussed; never substitute an unrelated package. `reference-assets/` holds the supplied Acharya YouTube and Facebook profile screenshots and the HIIMS Meerut hospital photo. Use those only at relevant social or hospital speech; no Instagram screenshot was supplied. Show **82704-82704** when Acharya speaks about the contact number.

The main factory code now has a local media catalog and mixed video/image FFmpeg renderer. The three requested re-edits use the same rules with hand-curated transcript placements. They are stored under `processed/<existing-video-job>/reedit-v2/`, each with the final MP4, captions, manifest and review frames. Existing v1 renders are retained. These sample edits reused the already saved ElevenLabs transcripts and local media; they made no new B-roll, LLM or Gemini API calls. The n8n schedule remains inactive until the user reviews the v2 results. The revised automated planner/render path has offline smoke checks but has not been run end to end through n8n yet.

The three v2 folders are `processed/Dr-maa-Dr-Paa-_1080p-video-1bb99ba352a77d53/reedit-v2/` (12 shots), `processed/Avatar-Video_1080p-9--video-5859c635acc3b210/reedit-v2/` (32 shots), and `processed/Panchakarma_1080p-video-5970a993f0c3521f/reedit-v2/` (30 shots). `processed/sample-reedit-v2-index.json` lists their exact paths and `processed/sample-reedit-v2-quality-report.json` records format/timing checks. The review page served from the local review server is `reedit-review.html` in this task's Codex outputs directory.

## Goal and boundaries

The main factory takes an **already recorded** presenter video placed in `incoming/`. It transcribes the speech with ElevenLabs, asks Gemini to plan B-roll, prefers closely matching local stock videos and supplied product/reference images, generates stills for unmatched visual needs, creates captions, and renders a vertical video with FFmpeg. It does not create the presenter video from a prompt. The Meta publisher is a **separate** workflow that can draft social copy and post a finished video to both Instagram and Facebook after per-video manual approval. Keep these workflows separate.

## Where things live

| Item | Current Windows location / value | Purpose |
| --- | --- | --- |
| Project root | `C:\Users\js19187\Desktop\heygen workflow` | Live code, inputs, output, CSV, publisher |
| Compose directory | `C:\Users\js19187\Documents\Codex\2026-09-22\i-x20-2\outputs\n8n-docker` | Live Docker Compose and private `.env` |
| Container mount | `/files/heygen-workflow` | Bind mount of the project root used by scripts/workflows |
| n8n | `http://localhost:5678` | Docker-hosted editor |
| Input | `incoming/` | User-supplied video files |
| Tracking | `video-control.csv` | Job selection, stage, result, retries |
| Output | `processed/<video-and-job-id>/` | Final MP4, transcript, plan, images, cache, manifests |
| Publisher review queue | `publishing/queue/` | One editable JSON review file per prepared video |
| Historical tests | `Non-Essential Testing Items/` | Archived experiments; not required for runtime |

The live Compose service was previously confirmed running as `n8n-docker-n8n-1` using `n8n-with-ffmpeg:2.40.5`. The Docker API denied a fresh status query while writing this file; confirm with `docker compose ps` when taking over.

## Main factory

- Import/use `video-broll-factory-workflow.json`, named **AI Video Factory - Automated Folder Pipeline**. Its live imported ID was `tKy60MAwIvfrTDzM`; the JSON export itself has no ID. It has a manual trigger and a five-minute schedule, and was left inactive. The Set node processes at most one video per run.
- Core runner: `video-broll-factory.js`. Supporting code: `factory-state.js`, `local-media-catalog.js`, `render-mixed-broll.js`, `broll-transitions.js`, `srt-to-styled-ass.js`. Keep `fonts/TiroDevanagariSanskrit-Regular.ttf`, `fonts/Khand-Bold.ttf` (phone overlay), the approved subtitle ASS style, and renderer assets with the code. `assemble-test-video.js` remains for historical image-only manifests.
- Current provider configuration is ElevenLabs for transcription and Gemini for **both** B-roll planning and image generation. The live Compose `.env` had `ELEVENLABS_API_KEY` and `GEMINI_API_KEY` set at last check. `LLM_MODEL=gemini-3.8-flash` and `IMAGE_MODEL=gemini-3.1-flash-image`. OpenAI and Whisper are not required in the current configuration. Do not disclose the actual values. The example configuration is `video-broll-factory.env.example`.
- Output is 1080×1920 portrait. Mixed local stock videos, product photos, supplied screenshots and generated stills use the variable 2–5 second presenter gaps and ten rotating transitions described above. A placement lasts up to 1.8 seconds. Chosen transitions and nearby speech are recorded in `assembly-manifest.json`.
- Preserve the approved green-screen filter and crop, which were tuned to avoid eroding hair. Caption styling uses Tiro Devanagari Sanskrit and amber emphasis. The new mixed renderer keeps the source audio and does not add music or a whoosh; the historical renderer and sound asset remain in the project.
- The runner probes displayed video dimensions (including rotation metadata) and automatically selects the horizontal or vertical preparation path. Horizontal green-screen input is fitted into the approved 16:9 picture band on a 1080×1920 portrait working copy; 1920×1080 retains the previously approved crop exactly. Other horizontal aspect ratios are center-cropped into that band. Vertical input already at 1080×1920 passes through; other vertical sizes are scaled and center-cropped to 1080×1920. Square input stops with a clear framing error. Original inputs remain unchanged; their audio is transcribed. The n8n workflow calls the mounted runner, so no n8n node change or reimport is needed for this behavior.
- `video-control.csv` is authoritative for job state. New filenames auto-register; `done` jobs are skipped. After a failed/interrupted job is fixed, set its `retry` column to `yes` and leave `process=yes`. Close Excel or any CSV editor before running. A kernel lock serializes runs; the `.lock` file may remain while idle and must not be deleted during a run.
- `factory-cache.json` checkpoints transcript, plan, and each image with fingerprints/checksums. A retry reuses valid assets. A provider request accepted immediately before a crash may still incur a charge without a saved checkpoint.

To run the factory manually in n8n, open **AI Video Factory - Automated Folder Pipeline** and use **Run video factory**. With Docker running, this direct command is the fallback (run from the Compose directory):

```powershell
docker compose exec -T n8n node /files/heygen-workflow/video-broll-factory.js --folder /files/heygen-workflow/incoming --control-file /files/heygen-workflow/video-control.csv --output-root /files/heygen-workflow/processed --max-videos 1 --report-json
```

Do not use `n8n execute --id` against this running instance; it previously collided with the task broker's occupied port. A direct runner execution updates the CSV and output but might not appear in n8n's execution history. Leave the schedule inactive until the desired output is inspected.

## Completed work at this snapshot

| Source | Job ID | CSV status | Images | Final video |
| --- | --- | --- | ---: | --- |
| `Avatar_Video (1).mp4` | `video-06baf7ae057d58e0` | `done` | 26 | `processed/Avatar_Video-1--video-06baf7ae057d58e0/Avatar_Video-1-final.mp4` |
| `Panchakarma (1).mp4` | `video-ec8653e9c44acdd5` | `done` | 22 | `processed/Panchakarma-1--video-ec8653e9c44acdd5/Panchakarma-1-final.mp4` |

The Panchakarma final was verified as a 130.32-second, 1080×1920 H.264/AAC MP4. Its initial landscape avatar geometry issue was fixed with portrait preparation. A later transient Gemini HTTP 503 was recovered by retrying from saved transcript, plan, and already generated images. Both CSV rows had no remaining error and `retry=no` at this snapshot. Existing finished videos do not change automatically when factory settings change.

## Separate Meta publisher

- Workflow JSON: `publishing/meta-publishing-workflow.json`, named **Meta Publisher - Review Queue (Instagram + Facebook)**. Imported live ID was `923b2a94-4df7-407f-88d8-95b544d1545e`; it was inactive. Code: `publishing/meta-publisher.js` and `publishing/meta-api.js`; instructions: `publishing/README.md`.
- The user selected **both Instagram and Facebook**, with **manual approval for each video**. The publisher reads completed factory jobs and creates an editable `publishing/queue/<job-id>.json` draft with a Gemini-generated title and description from `transcript.json`. The queue was empty at this snapshot.
- **Do not run publisher draft preparation yet.** It sends transcript text to Gemini for social metadata, and a prior automatic review rejected that transfer pending explicit user authorization. No such approval has been received. `--check` is read-only/no API calls; `--prepare` and the n8n workflow's `--run` generate drafts and must wait for that authorization.
- Meta credentials were unset at last check: `META_PAGE_ID`, `META_IG_USER_ID`, `META_PAGE_ACCESS_TOKEN` in the live Compose `.env`. Add valid credentials and recreate the n8n service when ready. The Meta API path has not been live-tested; nothing has been posted by this workflow.
- A draft never posts until its `approval` is changed from `pending` to `approved`. `publish_at=null` means next queue run, or set an ISO timestamp with timezone. Instagram uses a Reel. Facebook uses a Page Reel for 4–60-second videos and a Page video for longer videos. The file tracks each platform separately; uncertain results become `needs_review` so the publisher does not blindly duplicate a post. Inspect Meta and the queue file before retrying those cases. Publishing has its own `.publisher.lockdir` overlap guard.

## Setup on this machine or another machine

1. Keep the project directory mounted at `/files/heygen-workflow`. The live Compose file is in the directory above; the portable transfer bundle supplies its own `docker-compose.yml`, `Dockerfile`, `.env.example`, and `START-HERE.md`.
2. Add or replace keys only in the private Compose `.env`. Ensure the n8n service actually receives variables through `env_file`/`environment`; a Compose `.env` alone does not inject them. Keep a stable `N8N_ENCRYPTION_KEY` and persistent n8n volume. Recreate n8n after changing environment variables.
3. On a fresh installation, build/start Docker with `docker compose up -d --build`, open n8n, and import the two JSON workflows separately. New installations do not inherit the prior n8n user account, database, credentials, or active state.
4. Put a finished source video with a unique filename in `incoming/` and let the file copy finish. Run one manual factory job, review the final MP4/audio/captions and CSV row, then consider enabling the factory schedule.
5. Configure and test Meta separately after the transcript-transfer authorization and Meta account details are available. Review each draft and approve each video individually before posting. Do not make social posting a dependency of the render factory.

## Transfer and next-chat instructions

The portable bundles are stored in `C:\Users\js19187\Documents\Codex\HN Video Factory Exports`: `HN-Video-Factory-AI-Handoff-Small-2026-09-25.zip` (code/assets, no media history) and `HN-Video-Factory-Full-Live-Project-2026-09-25.zip` (includes input videos, outputs, transcripts, images, CSV). These ZIPs predate the v2 changes above and must be rebuilt before using them to transfer the current factory. They intentionally exclude live `.env`, credentials, n8n database/account, Docker images, and `Non-Essential Testing Items/`. The full ZIP contains potentially private source videos and transcripts. Start with `PROJECT.md`, then the bundle's `START-HERE.md` and `AI-HANDOFF.md`, then the specific code/README for the task. On a new machine the Windows paths and imported workflow IDs are historical references, not setup requirements.

Before a new chat changes or runs anything, verify current Docker status, the exact `.env` variable **presence** (never print values), n8n workflow active state, `video-control.csv`, `publishing/queue/`, and the latest output manifests. Ask the user before any transcript transfer for Meta draft generation or before publishing a specific video unless already explicitly authorized in that chat. The completed video factory itself has already been authorized and run.

## One-off sample B-roll batch (2026-09-25)

The user downloaded stock B-rolls for the 22 videos in `Non-Essential Testing Items/sample/`. Fifty-six matching downloads were moved to `broll-assets/`. That folder now has `asset-map.json` (59 numbered asset IDs, including reused clips), `sample-shot-plan.csv`, and `sample-asset-catalog.csv`. No Envato key or provider call is needed to use these local files.

A separate one-off FFmpeg batch rendered all 22 sample videos with 265 of 337 planned B-roll placements. The 72 unavailable placements remain on presenter footage. The 1080×1920 H.264/AAC results were moved into factory-style per-video directories under `processed/`. Each sample directory contains its `-final.mp4`, `assembly-manifest.json`, `transcript.json`, `captions.srt`, `broll-plan.json`, styled ASS subtitles, and a README. `processed/sample-broll-batch-index.json` lists all 22 paths. The separate review page and summary remain at `C:\Users\js19187\Documents\Codex\2026-09-25\c-users-js19187-desktop-heygen-workflow\outputs\render-review.html` and `outputs\render-summary.md`. This batch did not change the live n8n workflow. The user will ask later for a new workflow using these downloaded clips.

