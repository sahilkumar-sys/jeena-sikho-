---
tags: [factory, operations]
---

# Factory Operations

## Flow

`incoming/` recorded video → ElevenLabs transcript and word timestamps → Gemini B-roll plan and images → local product/reference/stock matching → FFmpeg 1080×1920 render and styled captions → `processed/<video-and-job-id>/`.

The factory does not generate a presenter video. It processes at most one input per n8n run. `video-control.csv` is the authoritative job state; completed rows are skipped. Retry a fixed failed job by setting `retry=yes` while leaving `process=yes`. Close Excel or another CSV editor before a run. Do not delete the lock file during a run. [[PROJECT#Main factory|Full rules]]

## Entry points

- n8n: **AI Video Factory - Automated Folder Pipeline** → **Run video factory**. Schedule was inactive at the handoff.
- Direct runner from the live Compose directory: see [[PROJECT#Main factory|the exact Docker command]]. This can update output and CSV without adding n8n execution history.
- Main code: `video-broll-factory.js`; workflow export: `video-broll-factory-workflow.json`; config example: `video-broll-factory.env.example`.

## Retry and review

- `factory-cache.json` checkpoints transcript, plan, and generated images. Valid assets are reused on retry; a call accepted just before a crash may still have been charged.
- Inspect the final MP4, audio, Hindi caption wording and glyphs, chosen images, `assembly-manifest.json`, and the CSV row before enabling a schedule.
- The renderer chooses horizontal or vertical input preparation automatically; square input stops with a framing error. See [[PROJECT#Main factory|geometry details]].

## Visual constraints

Use [[Visual and Asset Rules]] for the current production rules. The 2026-10-03 AMG offline batch has a separate two-second shot cap and does not change production validation.
