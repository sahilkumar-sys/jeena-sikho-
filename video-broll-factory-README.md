# Automated supplied-video factory

## Portable Windows package — 7 October 2026

The project no longer requires files from `Documents\Codex`. Copy this entire folder to another Windows computer, install Docker Desktop, and run `Setup-Portable.cmd`. The setup validates the project-local vector runtime, builds the pinned n8n/FFmpeg image, starts n8n, and imports the workflow into project-local n8n data. Use `Start-Heygen.cmd` and `Stop-Heygen.cmd` afterward. See `PORTABLE-SETUP.md` for prerequisites and the private-environment warning.

## Production v7 — 5 October 2026

The live Desktop source now uses a video-first, variable-count visual plan. It prefers a directly relevant approved local clip, falls back to exact supplied product/reference photos or a generated still, and never repeats the same media file within one reel. The renderer checks both resolved paths and identical file bytes, including optional audio inserts. Shots follow spoken phrases at 2.1–4.2 seconds, with at least 1.5 seconds of presenter; there is no fixed video/image count or coverage target. A completed reel updates `processed/broll-usage-ledger.json` for a soft prior-use tie-breaker. The current approval gate is `approved-stock-ids.json`; indexed footage is not automatically approved.

For vector suggestions, double-click `Start-Vector-Retrieval.cmd` on the Windows host, then run the factory in Docker. Run `Refresh-Vector-Index.cmd` after adding local gallery clips, then restart the service. The service reads `vector-index/local-clips.sqlite` with the cached local SigLIP2 model and serves compact approved candidates. The factory checks its `/health`, translates short Hindi speech windows into English visual queries through its configured LLM, and sends only those candidates to the final planner. Its default Docker URL is `http://host.docker.internal:8766/search`; override `BROLL_RETRIEVAL_URL` in the container environment if needed. With at most 40 approved clips the planner also sees their full short catalog. If the service is down when the catalog grows beyond 40, it uses photos/generated stills instead of sending a huge list. Vector scores are rankings, not an automatic 80% fit gate.

The Python service was tested on Windows localhost, but Docker Desktop was down at promotion, so its container connection and a full v7 provider/render run remain unverified. Keep the schedule inactive and run a manual isolated sample before relying on v7 for unattended work. See `Future Vector Embedding Update.md` for test evidence and `versions/production-v7-2026-10-05/VERSION.md` for exact rollback. The sections below describe the earlier v6 implementation where they mention image-first, fixed counts or 50% coverage.

Import `video-broll-factory-workflow.json` for the main folder pipeline. It scans `incoming`, registers/selects jobs through `video-control.csv`, transcribes with ElevenLabs, creates original-language captions, plans English-prompted B-roll, generates images and renders into `processed`.

Read `FACTORY-FIXES.md` for current behavior and verification. Green-screen filters and approved visual settings are unchanged.

Required code: `video-broll-factory.js`, `factory-state.js`, `local-media-catalog.js`, `speech-duration-planner.js`, `render-mixed-broll.js`, `broll-transitions.js` and `srt-to-styled-ass.js`. Keep the approved ASS style and Tiro/Khand fonts in place. Run inside Docker/Linux with Node, FFmpeg, FFprobe and flock.

Host root: `C:\Users\js19187\Desktop\heygen workflow`. Container root: `/files/heygen-workflow`.

Configure the Docker service using `video-broll-factory.env.example`. A Compose `.env` does not automatically inject variables: use env_file or explicit environment entries, then recreate the service. Preserve the n8n encryption key and persistent volume. The current setup uses ELEVENLABS_API_KEY for transcription and one GEMINI_API_KEY for both B-roll planning and images. LLM_PROVIDER=gemini uses Google's Chat Completions-compatible endpoint with LLM_MODEL=gemini-3.8-flash; IMAGE_PROVIDER=gemini uses native generateContent with IMAGE_MODEL=gemini-3.1-flash-image. Existing OpenAI keys are not used in Gemini mode. The current keys passed an isolated v6 end-to-end test; a future replacement key must have access and image-model quota.

The Set node uses fixed `max_videos=1`, avoiding blocked $env expressions. Change this fixed number for n8n batch size; the environment variable is the direct CLI fallback. Keep the schedule inactive until one real output has passed inspection. Missing keys return needs_configuration; real failures and skipped failed jobs needing a retry are raised by the Report node.

Use unique filenames and finish copies before moving videos into incoming. The minimum modification-age check applies to selection, including existing CSV rows. Set AUTO_PROCESS_NEW_VIDEOS=false for manual approval; otherwise new files are selected automatically. process=no skips a row; done rows are skipped. Set process=yes and retry=yes after fixing a failed/interrupted job. Save and close Excel before processing.

Kernel locks serialize the entire tracker/output operation. Overlapping triggers return busy without calling providers or overwriting rows. Lock files remain on disk while idle; never delete them while they might be in use. Kernel ownership ends on exit/crash, without a six-hour timeout.

Each job's factory-cache.json records source/config fingerprints and file checksums. Matching transcripts, plans and individual images are reused. Missing/corrupt/mismatched assets are regenerated. Keep the complete job folder for retries. Legacy files without a trusted checkpoint are not silently reused. A crash after provider acceptance but before saving the result can still incur an unrecoverable request charge.

B-roll planning validates count, exact transcript anchors, media IDs, prompts, timing, focus and transition overlap. Invalid JSON or plans get up to two corrected LLM retries. A named product uses its exact `P` catalog ID and real supplied photo; unavailable product IDs do not silently become fabricated packaging. The LLM sees only approved local stock clips with no identifiable foreign people. Repeated phrases align to the closest timestamp hint, with Hindi combining marks preserved. Source focal points are converted to the renderer's crop coordinates using actual image dimensions.

The factory uses full-screen B-roll and targets roughly half the screen time for the presenter and half for B-roll. Each shot lasts 2.5–3.0 seconds, chosen near a spoken word or phrase ending, with a 2–5 second presenter gap. Still images dominate; no more than three directly relevant stock clips are used in one video. Ten restrained FFmpeg transitions rotate in order. Generated stills move gently from a wider view to a closer view. Real product, hospital and social images use contained framing for readability. The original audio remains; the renderer adds no music or whoosh. Existing completed videos remain as they were rendered.

CAPTION_MAX_WORDS accepts 2 or 3; genuine word timestamps are required. Hindi captions use NFC-normalized Tiro Devanagari Sanskrit. For already-composited videos, use AVATAR_COMPOSITE_ENABLED=false. The approved avatar defaults require compatible green-screen geometry. The Gemini image adapter requests vertical 9:16 images at 2K by default, saves the final inline image and ignores thought images. OpenAI-compatible synchronous image providers remain supported when explicitly selected.

A 1920x1080 landscape green-screen source is prepared as a 1080x1920 portrait source inside its processed job folder before avatar compositing. This uses the same white letterbox and 1080x608 picture band as the previously successful input. The original incoming file remains unchanged, and transcription uses its original audio.

The imported n8n workflow calls the mounted runner file, so edits to that code need no workflow re-import. The five-minute schedule remains inactive. Run one manual job, inspect its final video/audio/captions, then decide whether to enable the schedule. Changing injected API keys requires recreating Docker.

Rollback and current production snapshots live under `versions/production-v5-2026-09-26/` and `versions/production-v6-2026-09-26/`; see the v6 `VERSION.md` for restore steps. Secrets are not stored in either snapshot.
