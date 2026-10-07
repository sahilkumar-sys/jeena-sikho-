# Production v6 — 2026-09-26

The live n8n workflow `tKy60MAwIvfrTDzM` calls `/files/heygen-workflow/video-broll-factory.js` through the bind mount. It remains inactive until manually started or activated in n8n. This snapshot contains the promoted runner, renderer, prompts, catalog and workflow export. It contains no API keys or `.env` file.

The isolated production smoke run used a 15-second recorded source and a separate `/tmp` tracker. The complete path passed ElevenLabs word transcription, Gemini B-roll planning, three Gemini portrait image requests and FFmpeg rendering. The verified final MP4 was 1080×1920 with audio and captions; three 2.52-second B-roll shots occupied 50.4% of the video. A separate product-discussion plan selected real catalog IDs `P111` and `P112`. The main project tracker and completed videos were untouched.

## Edit contract

- ElevenLabs Scribe word timestamps drive captions and B-roll timing.
- Gemini 3.8 Flash plans transcript-specific visuals using exact product photo IDs and the approved neutral stock list; invalid plans receive up to two corrected retries.
- Gemini 3.1 Flash Image generates vertical 9:16 stills at 2K. Indian people and settings have priority when humans appear.
- B-roll shots last 2.5–3.0 seconds, with 2–5 seconds of presenter between shots and a target near 50% presenter screen time.
- At most three relevant stock clips appear per video. Ten transitions rotate; stills use a gentle out-to-in zoom.

## Restore the previous production version

Stop or let any running factory job finish first. In PowerShell, from the project root:

```powershell
$projectRoot = 'C:\Users\js19187\Desktop\heygen workflow'
$previous = Join-Path $projectRoot 'versions\production-v5-2026-09-26'
@('video-broll-factory.js','local-media-catalog.js','speech-duration-planner.js','render-mixed-broll.js','broll-transitions.js','srt-to-styled-ass.js','factory-state.js','video-broll-factory-workflow.json','video-broll-factory.env.example','video-broll-factory-README.md','PROJECT.md','ayurveda-subtitles-tiro-amber.ass') |
  ForEach-Object { Copy-Item -LiteralPath (Join-Path $previous $_) -Destination (Join-Path $projectRoot $_) -Force }
```

The existing n8n nodes point to the same mounted filename, so no import is needed for this code rollback. The v5 review videos remain under `processed/**/reedit-v5/`. Do not copy a saved `.env` over the current secrets.

To restore v6 again, use this version folder as `$previous` in the same command.
