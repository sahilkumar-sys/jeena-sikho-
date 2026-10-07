# Factory fixes — 23 September 2026

The agreed fixes have been implemented in the supplied-video factory. The green-screen renderer, keying/despill order, hair-edge treatment, avatar crop/transform, subtitle style, zoom and transition settings were preserved.

| Area | Corrected behavior |
|---|---|
| ElevenLabs transcription | A successful response is saved and returned using the correct variable. Word timestamps are requested explicitly and checked before caching. Missing keys still produce `needs_configuration`. |
| n8n configuration | `max_videos` is a fixed numeric `1`; it no longer reads the blocked `$env` expression. The shell command safely quotes paths. |
| Concurrent executions | Linux kernel locks cover the whole tracker read/register/process/write sequence and the output folder. A second run reports `busy` and skips safely. BusyBox flock support was tested in the actual n8n container. |
| Crash recovery | Kernel ownership disappears when its process exits or crashes. Lock files remain as stable placeholders; their presence does not mean a job is running. Do not delete them. An interrupted `processing` row can be retried with `retry=yes` once no execution is active, without the old six-hour delay. |
| CSV tracking | Quoted commas, quotes, Hindi text and multiline errors round-trip correctly. Writes use a temporary file and atomic rename. Malformed records stop processing rather than being silently rewritten. |
| Image retries | Each successfully downloaded and validated image is checkpointed. A retry reuses the matching transcript, plan and completed images, then generates only missing or invalid images. |
| Cache correctness | Source contents and generation settings are fingerprinted. Cached files must match their recorded SHA-256. Changed sources, plans or image models invalidate the relevant cache. Unverified old assets are not blindly reused. |
| B-roll timing | Repeated phrases select the occurrence nearest the intended timestamp. Hindi vowel/combining marks are preserved; partial-word matches are excluded. |
| B-roll framing | The planner requests a focal point and portrait-safe composition. The runner converts the focal point using actual generated-image dimensions and passes the crop position to the existing renderer. |
| Plan validation | Missing prompts, invalid timing/focus, wrong counts and excessive overlaps are rejected before image generation. Short transition overlaps remain allowed. Plain, fenced and prose-wrapped JSON are supported. |
| Rendering failures | Rendering uses a unique temporary MP4. Dimensions, duration and audio are checked before publishing the final filename. Source/asset checks precede API work. |
| n8n results | Job failures produce a structured report; the Report node explicitly marks failures as errors. Missing credentials remain an actionable waiting result. |
| API errors | Requests have a timeout. Transient errors retry with backoff/Retry-After; permanent authentication/request errors stop promptly. Raw HTTP response bodies are excluded from routine tracker errors. |

Caption grouping rejects segment-only/malformed input rather than silently exceeding the two/three-word limit. Long output-folder names retain their uniqueness suffix. The advertised `OPENAI_API_KEY` fallback is accepted by the initial key check.

## Verification

Fourteen offline regression tests passed on Windows and Docker's Node runtime. They cover transcription, CSV records, Hindi/repeated anchors, invalid plans, captions, crop coordinates, cache reuse/invalidation, input-age gating, key handling, provider errors, filenames and n8n expressions/reporting.

The Docker integration used the actual factory, FFmpeg renderer, Khand font/style and approved whoosh. All HTTP calls were mocked; no external provider was contacted.

1. Image 1 succeeded; image 2 deliberately failed.
2. The CSV recorded failure and the first image remained saved.
3. After `retry=yes`, exactly one additional mocked provider call generated image 2. Transcription, planning and image 1 were reused.
4. The final MP4 was verified as 1080×1920 H.264 with AAC audio and a 10.000-second duration.
5. A completed job ran again without provider calls.
6. Held tracker/output locks blocked competing executions before CSV changes. A separate check verified that the process retains its lock after the flock helper exits and the kernel releases it after its owner is killed.

Avatar composition was disabled in the synthetic fixture. Its production renderer and parameters were left unchanged, as requested. These checks validate pipeline behavior and media assembly; real account access and generated content quality still need a live test.

## Using the update

1. Keep the new `factory-state.js` with `video-broll-factory.js`. The shared renderer, subtitle converter/template, font and whoosh remain essential.
2. Import/re-import the updated `video-broll-factory-workflow.json` in Docker n8n. It remains inactive. Replacing the JSON on disk does not update an already imported workflow.
3. Add real API keys to the existing Docker Compose environment and recreate the service when ready. This repair did not add keys or change/restart the service. Preserve its existing n8n encryption key and persistent volume.
4. Give each new source a unique filename. Finish copying outside `incoming`, move it in, and allow the minimum age check to pass. File age alone cannot detect every paused copy.
5. Run one video manually and inspect voice, captions, B-roll relevance, framing and duration before scheduling.
6. For a failed job, fix the cause and set `process=yes`, `retry=yes` while the factory is idle. Save/close Excel. Keep the entire processed job folder, including `factory-cache.json`, plan and images, so retries can reuse them.

Change n8n's batch limit in its Set node. `MAX_VIDEOS_PER_RUN` remains the fallback for direct CLI calls without `--max-videos`.

New example environment settings:

```dotenv
REUSE_EXISTING_PLAN=true
REUSE_EXISTING_IMAGES=true
API_TIMEOUT_SECONDS=300
```

This factory runs inside Linux Docker and requires `flock`, already present in the current container. The standalone manual renderer remains unchanged.

## Remaining practical limits

- Saved checkpoints prevent unnecessary regeneration during ordinary retries. A failure after a provider accepts a request but before its result is saved cannot guarantee exactly-once billing without provider support.
- Framing instructions and focal points do not provide automatic visual subject detection. Inspect the first real output.
- Locks coordinate factory processes, not Excel. Edit the CSV only while idle. A database remains appropriate for multiple independent editors/workers at larger scale.
- A completed filename still represents the same job. Use new filenames for new source videos; incomplete-job retries verify source fingerprints.
- Provider model choices were preserved. Check the historical review's model lifecycle notes before the first live run.

Original files are backed up in a timestamped `Factory Fix Backup` folder under `Non-Essential Testing Items`. The exact path and hashes are recorded in `factory-fix-installation.json`. Installation does not modify media, live tracking rows or green-screen settings.

Evidence: [Docker verification](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/factory-fix-docker-verification.json), [regression test results](C:/Users/js19187/Documents/Codex/2026-09-23/ok-so/outputs/factory-fix-tests.txt).
