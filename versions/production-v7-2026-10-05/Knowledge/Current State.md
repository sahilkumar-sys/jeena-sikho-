---
tags: [project, status]
---

# Current State

## Production factory

The main n8n workflow is **AI Video Factory - Automated Folder Pipeline**. It reads `incoming/`, tracks work in `video-control.csv`, and writes to `processed/`. The live Desktop source is now **production v7**: video-first, variable B-roll count and coverage, unique assets within a reel, speech-led 2.1–4.2-second shots, and a soft prior-use ledger. The previous live files are backed up in `versions/pre-video-first-2026-10-05/`. The imported workflow calls mounted local code, so source changes do not require editing its nodes. Its schedule was not activated. See [[Future Vector Embedding Update#Production v7 handoff — read this first]] and [[PROJECT#Production v7 video-first promotion (5 October 2026)]].

Provider path remains ElevenLabs transcription, Gemini B-roll planning/image generation, and FFmpeg rendering. The optional Windows SigLIP2 service supplies compact vector candidates. Docker Desktop was unavailable at v7 promotion, so the new full n8n path and Docker-to-host vector connection still require a manual isolated test. The saved v6 15-second smoke test predates these visual changes. Recheck service status and provider access before another run.

## Separate v6 Codex beta

The `v6-beta-local-codex-llm` branch and its portable package are separate from production. Three beta videos were rendered, but Gemini image generation returned HTTP 402. Their final renders therefore reused approved v5 timings and local visual assets; they do **not** validate end-to-end generation of new beta imagery. Docker Desktop failed for that batch, and the Windows fallback runner made the renders. See [[PROJECT#V6 Codex LLM beta and three renders (2026-09-29)|beta record]] and [[Renders and Batches]].

## Publishing

The Meta publisher is separate and inactive at the handoff. It can prepare Gemini title and description drafts, but Meta credentials and a live posting test were outstanding. Posting requires approval in each queue JSON. See [[Publishing and Approval]].

## Verify before acting

Check Docker and n8n status, active workflow state, presence of required environment variables **without printing values**, `video-control.csv`, `publishing/queue/`, and the latest output manifests. The handoff is a snapshot, not a live status monitor. See [[PROJECT#Transfer and next-chat instructions|handoff checklist]].
