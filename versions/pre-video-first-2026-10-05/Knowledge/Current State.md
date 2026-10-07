---
tags: [project, status]
---

# Current State

## Production factory

The main n8n workflow is **AI Video Factory - Automated Folder Pipeline**. It reads `incoming/`, tracks work in `video-control.csv`, and writes to `processed/`. Production v6 promotes the approved v5 visual rules. Its schedule was left inactive at the last handoff. The imported workflow calls mounted local code, so source changes do not require editing its nodes. See [[Factory Operations]] and [[PROJECT#Main factory|source details]].

Provider path at the handoff: ElevenLabs transcription, Gemini B-roll planning, Gemini image generation, FFmpeg rendering. The handoff reports a successful isolated 15-second direct-runner v6 test; it did not run the n8n GUI node or change live CSV state. Recheck service status and provider access before another run.

## Separate v6 Codex beta

The `v6-beta-local-codex-llm` branch and its portable package are separate from production. Three beta videos were rendered, but Gemini image generation returned HTTP 402. Their final renders therefore reused approved v5 timings and local visual assets; they do **not** validate end-to-end generation of new beta imagery. Docker Desktop failed for that batch, and the Windows fallback runner made the renders. See [[PROJECT#V6 Codex LLM beta and three renders (2026-09-29)|beta record]] and [[Renders and Batches]].

## Publishing

The Meta publisher is separate and inactive at the handoff. It can prepare Gemini title and description drafts, but Meta credentials and a live posting test were outstanding. Posting requires approval in each queue JSON. See [[Publishing and Approval]].

## Verify before acting

Check Docker and n8n status, active workflow state, presence of required environment variables **without printing values**, `video-control.csv`, `publishing/queue/`, and the latest output manifests. The handoff is a snapshot, not a live status monitor. See [[PROJECT#Transfer and next-chat instructions|handoff checklist]].
