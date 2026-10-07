> Historical audit: the agreed code issues have since been repaired. Read FACTORY-FIXES.md for current status and verification. Green-screen changes were explicitly declined and the original renderer remains unchanged. Provider credentials and a live acceptance run are still required.

# Video factory review and setup guide

Reviewed 23 September 2026. Project: `C:\Users\js19187\Desktop\heygen workflow`.

**Verdict: the factory has a usable rendering foundation, but the current implementation is not ready for unattended production.** A fresh transcription deterministically crashes, the imported configuration would hit an n8n environment-access restriction, and overlapping runs can corrupt tracking state. Fix these before spending on a full provider run.

This review covers `video-broll-factory-workflow.json`, its Node runner and the shared rendering dependencies. The separate manual editing workflow was excluded from functional review. Source code, workflow definitions, live CSV, Docker configuration and n8n activation state were not changed. The requested cleanup was completed; the repairs described below remain recommendations.

## What this factory does

You supply a finished avatar/talking-head video with its voice already recorded. The factory adds supporting images, captions, transitions and final composition. It does not generate the avatar or replace the voice.

```text
Completed source video in incoming/
  -> scan and register in video-control.csv
  -> check process/status/retry controls
  -> extract audio and transcribe with ElevenLabs
  -> group word timestamps into short captions
  -> ask the LLM for a timed B-roll plan
  -> generate supporting images
  -> assemble with FFmpeg, subtitles and whoosh
  -> save final MP4 and update the tracking row
```

n8n supplies a manual trigger, a five-minute timer, path settings and a result node. Most of the actual work happens inside `video-broll-factory.js`, launched through Execute Command in the Docker container. This is why importing the workflow alone is insufficient.

At `IMAGES_PER_MINUTE=17.5`, a 60-second source requests 18 images and a 90-second source requests 26. These are requested counts, not a guarantee of a sensible timeline until plan validation is improved. The default image duration is 3.5 seconds, so planned overlaps need deliberate validation; the previously approved timing examples also contain intentional overlaps.

The current code's actual output structure is:

```text
processed/
  <source-name>-<job-id>/
    audio-for-scribe.mp3
    transcript.json
    captions.srt
    broll-plan.json
    broll/
      broll-001.png
      ...
    assembly-manifest.json
    <source-name>-final.subtitles.ass
    <source-name>-final.mp4
```

Names differ slightly from the handout's illustrative `images/`, `render-manifest.json` and `final-video.mp4`. The CSV's `output_video_url` contains a local container path, not a public link. Translate `/files/heygen-workflow/` to the Windows project folder when opening it on the host. No Drive upload or social publishing exists in this factory.

## What is already ready on this machine

| Item | Observed result |
|---|---|
| Main container | `n8n-docker-n8n-1`, running image `n8n-with-ffmpeg:2.40.5` |
| Runtime | n8n 2.40.5; Node v26.7.0; FFmpeg and FFprobe 8.1.2 |
| Bind mount | Windows project folder mounted read/write at `/files/heygen-workflow` |
| n8n persistence | Existing named volume at `/home/node/.n8n` |
| Execute Command | Enabled; unrelated file nodes remain excluded |
| Rendering assets | Shared renderer, subtitle converter, style, Khand font and approved MP3 accessible |
| Factory input/output | `incoming/` and `processed/` exist and were empty at inspection |
| Main workflow import | Automated folder factory not found in the running instance; only the separate inactive local editing test was found |
| Provider configuration | Required factory API keys were missing/empty in the running container |

A synthetic two-second render inside the actual container passed. It used two image placements, the real Khand style/font and the approved whoosh. FFprobe confirmed 1080×1920 H.264 video, AAC audio and a 2.000-second duration. It took about 2.1 seconds; this tiny synthetic fixture is not a production throughput benchmark. Avatar composition was disabled for that integration check and inspected separately below.

## Issues to address, in order

Source references below refer to the unchanged reviewed files. P1 means a blocker or serious correctness issue; P2 means a material reliability, cost or quality issue.

| Priority | Issue and evidence | Required change |
|---|---|---|
| P1 | **Fresh transcription crashes.** `video-broll-factory.js:309` stores the successful reply in `response`; lines 320–321 refer to out-of-scope `result`. A mocked successful Scribe reply produced `result is not defined`, without saving the transcript. | Save and return the same outer response variable. Test a successful fresh transcription before enabling paid jobs. |
| P1 | **The n8n configuration expression is blocked.** Workflow line 27 reads `$env.MAX_VIDEOS_PER_RUN`. Installed n8n code blocks this unless `N8N_BLOCK_ENV_ACCESS_IN_NODE` is explicitly `false`; it is absent here. | Set `max_videos` to a fixed numeric `1` in the Set node. Child processes can still inherit container environment variables. This avoids changing the instance-wide restriction. |
| P1 | **Concurrent runs overwrite tracking state.** Each run reads the CSV once at runner line 627 and repeatedly writes its entire stale snapshot, including lines 668 and 688. Two mocked simultaneous runs both completed, but the CSV ended with one video still `processing`. | Serialize the complete batch with an exclusive control lock, or use transactional job storage. Per-video locks and `max_videos=1` do not serialize scheduled executions. |
| P1 | **Multiline CSV cells do not round-trip.** The reader splits physical lines before parsing records at runner lines 118–123. A single quoted multiline error became two rows and lost the retry value. FFmpeg errors naturally include newlines. | Use a CSV parser supporting quoted multiline records; write via a temporary file and atomic replacement under the same control lock. |
| P1 | **Green-screen filter order compromises removal.** `assemble-test-video.js:159` applies despill before chromakey, changing the color that the keyer expects. On an actual source background patch, alpha averaged about 252/255, nearly opaque; keying before despill made it transparent. | Key the original green first, then despill while preserving alpha. Retain the approved crop/transform. Compare a real frame before accepting the correction. |
| P2 | **Retries regenerate paid images and plans.** Runner lines 596–599 always replan; line 514 always requests every image. An offline retry with existing transcript, plan and image still called both mocked APIs and overwrote the image. | Cache a validated plan and completed images against source/config fingerprints. Resume only missing or invalid assets. |
| P2 | **B-roll alignment and validation are weak.** Repeated phrases always match their first occurrence at lines 459–470. Hints of 2s and 30s both resolved to 1s. `{images:[{}]}` passes the current plan check. | Validate prompts, finite times, durations and count before generation; choose the phrase occurrence closest to its hint; review accidental overlap and timeline coverage. |
| P2 | **Hindi anchor normalization loses vowel marks.** Line 456 excludes Unicode combining marks. `मान` and `मीन` collapse to the same text. | Preserve `\p{M}` when normalizing anchor text. Subtitle text itself is preserved in the normal word-timestamp path. |
| P2 | **Visual focus is lost between planner and renderer.** The planner schema omits focus fields and portrait-framing instructions; lines 515–521 discard focus values even if supplied. | Request and validate focus/framing information and carry it into the manifest. The renderer otherwise uses a center crop. A square image initially loses about 44% of its width to fill a 9:16 frame. |
| P2 | **Copy readiness is only an age check.** Discovery checks modification time, not stable size across observations. Existing CSV rows bypass this filter through lines 164–170. | Recheck every selected input. Prefer completed-file delivery by staging outside `incoming` and renaming into it, combined with source validation. |
| P2 | **Stale locks have no ownership or heartbeat.** Lines 236–249 reclaim any lock older than six hours. A still-running long job can lose its lock. | Use ownership-aware locking and liveness checks. Do not reclaim a lock solely because six hours passed. |
| P2 | **Partial output can have the final filename.** The renderer writes directly to the final MP4 with overwrite enabled; the runner does not verify its streams or duration afterward. | Render to a temporary MP4, probe it, then rename to the final filename. An ordinary nonzero render failure is correctly marked failed, but a partial file may remain. |
| P2 | **Invalid input/assets can fail after API spending.** Crop, font/style, music and rendering prerequisites are checked late. The fixed avatar crop requires compatible source geometry. | Check source audio, dimensions, duration, media readability and all rendering assets before API calls. |
| P2 | **Failure reporting is incomplete in n8n.** The runner exits nonzero on failed jobs, so Execute Command stops before Report. Missing keys instead exit successfully with `ok:false`. | Add explicit success/wait/failure handling. Simply enabling Continue On Fail does not preserve stdout in the inspected Execute Command implementation. Do not treat a green n8n execution alone as proof of a completed video. |

Additional limitations: HTTP requests have no explicit application deadline, retries use only 1.5/3-second waits and retry permanent errors too, and image URL downloads are outside that retry wrapper. Add bounded timeouts, retry only appropriate network/429/5xx failures, respect `Retry-After` and use backoff. The API helpers accept `OPENAI_API_KEY` but the initial key gate still requires explicit `LLM_API_KEY` and `IMAGE_API_KEY`; supply the latter until the rules are made consistent.

The LLM parser accepts plain JSON and simple code fences at the start/end. Extra prose or invalid JSON fail the job; there is no corrective planning retry after content validation. Too few images fail, while extra images are silently truncated. The planner receives the full original-language transcript plus word timestamps and requests English image prompts, which matches the intended language separation.

Job IDs are based on source paths, not content. Replacing a file under a completed filename does not create a new job, and retries can reuse a transcript from the old contents. Give each new source a unique filename until content fingerprinting is implemented. Truncating long output-folder names can also remove the job-ID suffix; preserve the unique ID when hardening naming.

Credentials are not embedded in the workflow or normal manifests. However, raw provider response snippets/URLs and stack traces enter CSV and execution logs on failure. Redact error output before claiming secrets can never appear in history. Cost/request metadata is committed mainly after full success, so failed downstream work is not reliably accounted for.

The keying diagnosis was checked on the supplied reference video's frame. These diagnostic renders compare the current filter order with keying before despill; they are evidence, not an applied production change:

| Current filter order | Keying before despill |
|---|---|
| ![Current keying leaves visible original background](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/keying-current.png) | ![Diagnostic key-first render has a uniform tan background](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/keying-order-check.png) |

## Rendering and API checks that passed

- All three JavaScript files pass Node syntax checking. The factory JSON parses, all five node connections resolve, and its exported state is inactive. Syntax checks alone do not catch the transcription variable error.
- Fresh per-job locks prevent a second acquisition; completed rows are skipped, and failed rows require `retry=yes`. These checks do not solve the shared CSV race.
- Normal Scribe word entries group into short cues with original-language text. Two-word and three-word limits work for ordinary individual word entries. The fallback accepting whole transcript segments does **not** guarantee that limit; a single five-word segment produces a five-word cue even with a limit of two. Reject unsupported transcript shapes or split them with defensible timing.
- The approved avatar transform values are passed through. The zoom calculation is centered on the already cropped portrait frame; no separate zoom-drift defect was found. Focus selection upstream is the gap.
- Old template dialogue is removed, and subtitles are burned once after B-roll overlays. Use a clean source without already burned captions to avoid two visible caption tracks.
- The voice remains in the mix. Optional music is reduced to a fixed volume; this is not automatic voice ducking or loudness normalization. Whoosh is added at each placement start.

ElevenLabs request construction matches the current endpoint: multipart file, `xi-api-key`, `model_id=scribe_v2`, with word timestamps the documented default. Explicitly setting `timestamps_granularity=word` would make the requirement clearer. Authentication and live response behavior still require a real test. [ElevenLabs create transcript documentation](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).

The configured OpenAI image request shape is compatible with synchronous image generation and base64 results. An asynchronous provider requires a separate submit/poll/download adapter; changing the URL alone is insufficient. [OpenAI image API reference](https://developers.openai.com/api/reference/resources/images/methods/generate).

The configured `gpt-image-1` is scheduled to shut down on **23 October 2026**. OpenAI lists `gpt-image-2` as its replacement; validate that model's output, access and cost before switching the factory. No model setting was changed during this review. [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations).

If choosing Anthropic, change the provider, API URL and model together. The native branch's fallback names Claude Sonnet 3.5, whose models were retired in October 2025. [Anthropic model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations).

## Setup from the current state to a first accepted video

1. **Repair the blockers first.** Fix transcription, n8n input configuration, CSV records/concurrency and the keying order. Add plan validation and resumable image generation before a large batch. Keep the five-minute schedule inactive throughout acceptance testing.

2. **Use the existing Docker installation and Compose project.** Docker, n8n and FFmpeg already work here. The active Compose directory is:

   ```text
   C:\Users\js19187\Documents\Codex\2026-09-22\i-x20-2\outputs\n8n-docker
   ```

   Its `docker-compose.yml` manages the existing `n8n` service. Keep its persistent volume and project bind mount. The project Dockerfile uses a local base-image alias, `n8n-base-local:2.40.5`, so rebuilding on a new computer requires pinning/providing the intended base image first. A rebuild is unnecessary just to inject credentials into the currently working image.

3. **Configure credentials privately.** Merge the factory variables from `video-broll-factory.env.example` into the existing Compose directory's `.env`. Preserve its existing n8n encryption key and other configuration; do not replace the file wholesale. Enter `ELEVENLABS_API_KEY`, `LLM_API_KEY` and `IMAGE_API_KEY` there. Verify each provider's billing and model access. Keep actual keys out of workflow JSON, CSV and the shared media folder.

4. **Inject that environment into the service.** Under `services.n8n`, add `env_file: [".env"]`, or explicitly map every required factory variable. The current Compose environment block omits ElevenLabs and includes older transcription settings. A Compose `.env` normally supplies interpolation; it is not automatically the container environment. Explicit `environment` values override `env_file`, including blank values. Using the same existing `.env` keeps current substitutions consistent. [Docker interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), [environment precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/).

5. **Choose initial operating settings.** Start with the settings below, and retain the remaining approved geometry/style/sound values from the example:

   ```dotenv
   MAX_VIDEOS_PER_RUN=1
   AUTO_PROCESS_NEW_VIDEOS=false
   IMAGES_PER_MINUTE=17.5
   CAPTION_MAX_WORDS=3
   MIN_VIDEO_AGE_SECONDS=30
   REUSE_EXISTING_TRANSCRIPT=true
   ```

   Use `AVATAR_COMPOSITE_ENABLED=true` only for sources matching the approved green-screen geometry. Use `false` for videos already composited. This is currently a global setting, so process compatible source types together. All media paths passed to n8n must start with `/files/heygen-workflow/...`, not Windows drive letters.

6. **Recreate the existing service to load changes.** These are operator instructions, not commands run by this review:

   ```powershell
   Set-Location -LiteralPath 'C:\Users\js19187\Documents\Codex\2026-09-22\i-x20-2\outputs\n8n-docker'
   docker compose config --quiet
   docker compose up -d --no-build --force-recreate n8n
   ```

   A restart alone does not reload changed environment configuration. Recreating the service preserves mounted volumes; keep the existing volume configuration. [Docker restart](https://docs.docker.com/reference/cli/docker/compose/restart/), [Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/).

7. **Import only the main factory.** Open [local n8n](http://localhost:5678), import `video-broll-factory-workflow.json`, then open “Set factory inputs.” Keep the three `/files/heygen-workflow/...` paths. Change `max_videos` from the `$env` expression to a fixed Number `1`. Save without activating/publishing the schedule. Execute Command runs inside this container. [n8n Execute Command documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/).

8. **Stage one completed source.** Copy a compatible video to a staging location on the same drive, then move it into the project's `incoming` folder once copying is complete. Use a unique filename. Wait at least 30 seconds. Manually run the main factory once with automatic selection disabled; it should register the row as pending/awaiting selection without paid processing.

9. **Select and process it.** While no execution is running, open `video-control.csv`, change that row's `process` to `yes`, save in UTF-8 CSV format and close Excel. Do not save a stale Excel copy while the runner is updating the file. Run the main factory manually. With valid credentials, this run is billable. This validates the production factory itself; it does not use the separate editing-test workflow.

10. **Accept the result before scheduling.** Require CSV `status=done`, a playable output MP4, source-length voice/audio, correctly timed Hindi or other original-language captions, readable text inside frame boundaries, an actually solid tan background when enabled, relevant B-roll with intact subjects, centered zoom, and audible but unobtrusive whooshes. Inspect early, middle and final sections. Test a controlled failure/retry and overlapping trigger attempt after the repairs to confirm recovery and serialization.

11. **Enable ongoing operation.** Once acceptance passes and concurrency protection is in place, activate/publish the five-minute schedule. Keep one video per run initially. This limit controls how many jobs one run handles; it does not impose a runtime deadline or independently prevent concurrent runs. Measure real API/render latency before changing capacity.

## Day-to-day controls and costs

| Action | Control |
|---|---|
| Select a pending video | `process=yes` |
| Leave it queued but unselected | `process=no` |
| Retry a failed video | Fix the cause, then set `process=yes`, `retry=yes` |
| Reuse a completed filename for new content | Avoid this; use a new unique source filename |
| Change caption chunk size | `CAPTION_MAX_WORDS=2` or `3`, then recreate to apply environment changes |
| Process already-composited videos | `AVATAR_COMPOSITE_ENABLED=false` |
| Check progress | CSV `stage` and n8n execution details |

Current retry behavior reuses only the transcript. Until asset resumption is fixed, a retry may charge for the LLM and all images again. Do not clear a processing lock without verifying that its owner has stopped. After a crash, the current row gate also needs `retry=yes` and an age of at least six hours; this is a limitation to improve, not reliable automatic recovery.

ElevenLabs currently lists Scribe v2 at $0.22/audio hour, approximately $0.00367/minute. The runner's duration-based arithmetic is reasonable as a base estimate, using the audio stream duration when available, but excludes failed-request accounting, LLM/image costs, taxes and plan-specific allowances. [ElevenLabs API pricing](https://elevenlabs.io/pricing/api).

Images are likely the main API cost. For the currently configured GPT Image 1, 18 square images have output-only listed costs of about $0.20 at low, $0.76 at medium or $3.01 at high quality, before prompt tokens, LLM costs, retries and taxes. The runner does not specify image quality, so it uses the API default and cannot promise one of those totals. Budget again when selecting its replacement model. [GPT Image 1 pricing](https://developers.openai.com/api/docs/models/gpt-image-1).

For a single operator and modest batches, a correctly locked CSV with atomic writes is adequate. For multiple workers, higher volume or concurrent editors, use a transactional database/queue with a unique source fingerprint and atomic job claims. Keep this factory separate from the older avatar-generation/Google-Sheets service templates; merging them adds dependencies that this supplied-video task does not require. Keep backups of original videos, the tracker, configuration and accepted outputs, and monitor disk usage.

## Cleanup completed

Created the exact requested folder:

```text
C:\Users\js19187\Desktop\heygen workflow\Non-Essential Testing Items
```

Moved **40 root entries containing 46 files**, approximately **400 MiB**, into it. These include old workflow templates/contracts, manual-test inputs and outputs, sample B-roll, reference videos, subtitle experiments, previews and obsolete logs. No files were deleted. All moved file SHA-256 hashes matched after relocation, and the eleven retained essential root files were unchanged. `incoming/`, `processed/` and `fonts/` were retained.

The shared `assemble-test-video.js` and `srt-to-styled-ass.js` remain essential even though their names/origins refer to testing. The approved subtitle template, Khand font and `woosh-sound-effect.mp3` also remain in their original locations.

The original general README described older systems, so it was archived. A new root README points to this factory guide. `cleanup-receipt.json` in the archive records original/destination paths and SHA-256 values. Archived manual-test manifests retain their original text and absolute paths; restoring that test later requires restoring its assets to the original paths or deliberately updating those archived paths.

## Verification scope

Completed: actual source inspection, Node syntax and workflow structure checks, runtime/mount/environment-presence checks, deterministic offline tests reproducing runner defects, separate keying filter comparison, a successful synthetic Docker renderer integration run, and hash verification of cleanup.

Machine-readable records: [offline runner evidence](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/offline-audit-evidence.json), [Docker render verification](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/docker-render-verification.json), and [cleanup receipt](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/cleanup-receipt.json).

Not performed: paid ElevenLabs/LLM/image requests, a full live factory job, source repairs, Docker configuration changes, workflow import/activation, or a bulk-load soak test. A final automated production video is therefore not claimed. Review findings remain open until the corresponding repairs and live acceptance run succeed.
