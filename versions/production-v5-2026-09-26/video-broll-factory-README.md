# Automated supplied-video factory

Import `video-broll-factory-workflow.json` for the main folder pipeline. It scans `incoming`, registers/selects jobs through `video-control.csv`, transcribes with ElevenLabs, creates original-language captions, plans English-prompted B-roll, generates images and renders into `processed`.

Read `FACTORY-FIXES.md` for current behavior and verification. Green-screen filters and approved visual settings are unchanged.

Required code: `video-broll-factory.js`, `factory-state.js`, `assemble-test-video.js`, `broll-transitions.js` and `srt-to-styled-ass.js`. Keep the approved ASS style, Khand font and whoosh in place. Run inside Docker/Linux with Node, FFmpeg, FFprobe and flock.

Host root: `C:\Users\js19187\Desktop\heygen workflow`. Container root: `/files/heygen-workflow`.

Configure the Docker service using `video-broll-factory.env.example`. A Compose `.env` does not automatically inject variables: use env_file or explicit environment entries, then recreate the service. Preserve the n8n encryption key and persistent volume. The current setup uses ELEVENLABS_API_KEY for transcription and one GEMINI_API_KEY for both B-roll planning and images. LLM_PROVIDER=gemini uses Google's Chat Completions-compatible endpoint with LLM_MODEL=gemini-3.8-flash; IMAGE_PROVIDER=gemini uses native generateContent with IMAGE_MODEL=gemini-3.1-flash-image. Existing OpenAI keys are not used in Gemini mode. A replacement Gemini key still needs a live planning/image test and appropriate model quota; the previous key had zero free-tier image quota.

The Set node uses fixed `max_videos=1`, avoiding blocked $env expressions. Change this fixed number for n8n batch size; the environment variable is the direct CLI fallback. Keep the schedule inactive until one real output has passed inspection. Missing keys return needs_configuration; real failures and skipped failed jobs needing a retry are raised by the Report node.

Use unique filenames and finish copies before moving videos into incoming. The minimum modification-age check applies to selection, including existing CSV rows. Set AUTO_PROCESS_NEW_VIDEOS=false for manual approval; otherwise new files are selected automatically. process=no skips a row; done rows are skipped. Set process=yes and retry=yes after fixing a failed/interrupted job. Save and close Excel before processing.

Kernel locks serialize the entire tracker/output operation. Overlapping triggers return busy without calling providers or overwriting rows. Lock files remain on disk while idle; never delete them while they might be in use. Kernel ownership ends on exit/crash, without a six-hour timeout.

Each job's factory-cache.json records source/config fingerprints and file checksums. Matching transcripts, plans and individual images are reused. Missing/corrupt/mismatched assets are regenerated. Keep the complete job folder for retries. Legacy files without a trusted checkpoint are not silently reused. A crash after provider acceptance but before saving the result can still incur an unrecoverable request charge.

B-roll planning validates count, prompts, timing, focus and transition overlap. Repeated phrases align to the closest timestamp hint, with Hindi combining marks preserved. Source focal points are converted to the renderer's crop coordinates using actual image dimensions. Existing zoom/transition behavior remains.

The factory uses full-screen B-roll. It targets 10 placements per minute (rounded to a whole image) and caps each placement at 2 seconds. Each new render randomly chooses an entry effect per B-roll from 54 options: a clean cut and 53 FFmpeg transitions. Pixelize and the four corner wipes (`wipetl`, `wipetr`, `wipebl`, `wipebr`) are excluded. Consecutive B-rolls cannot get the same effect, and the chosen effects are recorded in `assembly-manifest.json`. The entry effect reveals the image over the presenter; the exit remains a short fade. The bordered-card preview was a separate test and is not used by this workflow. Existing completed videos remain as they were rendered.

CAPTION_MAX_WORDS accepts 2 or 3; genuine word timestamps are required. For already-composited videos, use AVATAR_COMPOSITE_ENABLED=false. The approved avatar defaults require compatible green-screen geometry. The Gemini image adapter saves the final inline image and ignores thought images. OpenAI-compatible synchronous image providers remain supported when explicitly selected.

A 1920x1080 landscape green-screen source is prepared as a 1080x1920 portrait source inside its processed job folder before avatar compositing. This uses the same white letterbox and 1080x608 picture band as the previously successful input. The original incoming file remains unchanged, and transcription uses its original audio.

After a manual live run, inspect final video/audio/captions before enabling the five-minute schedule. Changing the key requires recreating Docker; the workflow JSON does not need re-importing.
