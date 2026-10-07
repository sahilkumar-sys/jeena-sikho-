# Instructions for an LLM working on this project

This is the live, portable Heygen video factory. Resolve the project root from this file's directory; do not assume a fixed Windows user or drive path. The project is bind-mounted into Docker at `/files/heygen-workflow` and is **not a Git repository**. “Main” means the files in this root. Reply to the user in English.

## Read first

1. Read the newest dated sections at the top of `PROJECT.md` for status and history.
2. Read the top of `Future Vector Embedding Update.md` for B-roll retrieval, E: indexing, limits, and rollback context.
3. Inspect the relevant live code and current tracker before acting. Older sections in those files and `video-broll-factory-README.md` still describe v5/v6 image-first behavior; the v7/v7.1 sections supersede them.
4. For the last completed samples, read `portable-reference/samples/` when present. Historical absolute paths in old manifests and dated notes are provenance only and are not runtime dependencies.

## What the project does

- `incoming/` holds finished presenter/source videos. The factory transcribes the existing speech, chooses speech-aligned B-roll, adds captions, and renders a 1080×1920 H.264/AAC MP4. It does not create the presenter performance.
- `video-control.csv` is the authoritative queue and retry tracker. `processed/<job>/` holds outputs, transcripts, plans, captions, manifests, and checkpoints. Do not edit the CSV during a run or delete its lock file while it may be active.
- `video-broll-factory.js` is the main runner; `video-broll-factory-workflow.json` is the n8n wrapper. The separate `publishing/` workflow drafts social copy and posts only after per-video approval. A render request does not authorize posting.
- `versions/` contains production and rollback snapshots. The live root currently contains the v7.1 caption changes; changing a snapshot does not change live code.

## Current editing rules

- For each spoken beat, first search fitting videos in the supplied local folders (`broll-assets/`, Extended B-Roll Library, and E: when healthy); check actual frames and rights. If no local video closely fits, acquire the closest fitting Envato video. If no fitting video is available, search existing stock/local stills, including exact product/reference photos; generate a still only as the last fallback. **Never generate video B-roll.** Target roughly 70% video / 30% image B-roll when suitable assets permit, and prioritize close transcript fit over the ratio. The live v7.1 factory does not yet automate this full order; see the top of `PROJECT.md`.
- Select stock footage only through `approved-stock-ids.json` and `local-media-catalog.js`. A clip being indexed is not approval. Match named products to their actual images in `product-assets/`; never invent packaging or present illustrative footage as real proof of a claim.
- Never reuse the same video, photo, or audio B-roll asset within one finished reel. The planner and renderer enforce path/byte uniqueness; visually near-duplicate re-encodes still need review. In other reels, prefer a fresh equally relevant clip using `broll-usage-ledger.js`, but factual fit outranks novelty.
- Align shots to the transcript and phrase endings. Current validation generally allows 2.1–4.2-second shots and requires at least 1.5 seconds of presenter between shots. Preserve original source audio and the approved vertical framing/caption style.
- `caption-grammar.js` runs after ElevenLabs transcription in the live v7.1 code. Preserve `captions.raw.srt`, cue indices/timestamps, numbers, and spoken meaning. Review Hindi spelling, names, and medical terms against audio; structural validation alone does not prove accurate captions.

## Provider boundary as of 5 October 2026

The user's latest instruction is **do not use Gemini services; use ElevenLabs and Codex image generation for images**. The current automated production runner still has Gemini-configured planning, image, and caption-provider paths. Therefore, do not start a full provider-driven production run under the current configuration. First build and verify an explicitly non-Gemini path, or use an isolated, agent-assisted sample with saved ElevenLabs transcript, Codex-generated stills, local plan/caption validation, and the existing renderer. Do not describe such a sample as a full automated production-provider test.

The completed no-Gemini sample is `horizontal example.mp4`: 53.333 seconds; eight unique B-roll placements (one approved video, three supplied product photos, four Codex-generated stills); 60 timed caption cues with three manual “Dr. Paa” fixes. Its final MP4 is under the task output directory named above. It left the live tracker, n8n schedule, and publisher unchanged.

## Retrieval and gallery

- The production-approved local project gallery is under `broll-assets/`; `vector-index/local-clips.sqlite` and `vector-retrieval-service.py` provide local SigLIP2 search. The model, Python runtime and environment live under `runtime/vector-cache/`. `Start-Vector-Retrieval.cmd` repairs moved-path metadata and starts the Windows service. `Refresh-Vector-Index.cmd` refreshes the project gallery after additions. Search narrows candidates; a vector similarity is not an 80% semantic-fit probability.
- `E:\Envato Stocks` is a separate experimental gallery. Its ten-frame index completed 246 of 247 permitted clips; the one error is a zero-byte Heart file. **Exclude the entire `E:\Envato Stocks\All panchkarma therepy` folder from E: indexing and ordinary E: batch work.** Its therapy-named folders were discussed as contextual labels, but no E: clip is thereby production-approved. Do not send thousands of clip descriptions to an LLM; locally retrieve a short candidate list.

## Safe working sequence

1. Confirm the actual user request, current code, queue state, Docker state, and whether a vector service is available. Read configuration variable **names/presence** only; never print or copy secret values.
2. For code changes, preserve a rollback copy under `versions/`, edit the live root, and run focused syntax/tests. Keep the n8n schedule inactive unless the user asks to activate it.
3. For a sample, use a private input/tracker/output or another isolated path. Do not change completed `processed/` files or live CSV rows just to demonstrate a new edit. Reuse a valid saved ElevenLabs transcript when appropriate; call ElevenLabs when a fresh transcript is necessary and authorized by the task.
4. Validate exact asset IDs, shot timing, uniqueness, source audio, captions, and output with `ffprobe` plus representative frame review. Confirm 1080×1920 H.264/AAC and source-length alignment. Report what actually ran and what was not exercised.
5. Update the top of `PROJECT.md` and `Future Vector Embedding Update.md` after material changes so a new chat can resume without reading the entire history. Put the final paths and verification limits there.

For Docker setup, see `PORTABLE-SETUP.md`, `video-broll-factory-README.md`, and `runtime/n8n/docker-compose.yml`. The current n8n schedule was left inactive. Never print or copy values from `runtime/n8n/.env` into chat or documentation.
