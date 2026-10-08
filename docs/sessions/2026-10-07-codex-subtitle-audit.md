# Subtitle spelling and punctuation audit — Codex, 2026-10-07

Branch/PR: `codex/subtitle-audit` (from `claude/session-log-rule`), none

## Request
Check why the project's subtitles had spelling, punctuation and related problems.

## Done
- Inspected the live transcription, short-cue builder, caption correction/validation/cache, SRT-to-ASS conversion, saved captions and relevant sample notes. Runtime code and completed outputs were not edited.
- All 23 top-level `processed/` jobs with both transcript and SRT exactly match the current raw builder after line-ending normalization. None has `captions.raw.srt` or a caption-correction cache record. Together with the recorded pre-v7.1 history, this supports those outputs having bypassed correction; equality alone would not establish that.
- The portable horizontal sample's raw SRT also exactly matches the builder. Its editorial pass changed only three `Pa` to `Paa` instances (cues 24, 34, 57). It was not a provider-based spelling/punctuation pass; see its `caption-review.json`.
- `video-broll-factory.js:377` groups at most 2–3 word entries, splitting after any terminal period, question/exclamation mark or danda and after pauses over 0.42 seconds. It copies transcription text without adding punctuation. Treating abbreviation periods as sentence ends splits `Dr.` from its name. The horizontal sample has standalone `Dr.` cues 20 (0.08 s), 23 (0.24 s), 26 (0.10 s), 55 (0.10 s). No minimum readable cue duration is enforced beyond 0.08 seconds.
- `caption-grammar.js` asks the text provider to fix spelling and punctuation but cannot merge cues or alter timings. It supplies chunks of 30 cues plus one raw neighboring cue on each side, with no audio or project glossary. Correct names/medical terms and sentence punctuation remain editorial judgments.
- Validation checks count/order, permitted text, length and numeric strings, not linguistic accuracy. Offline probes accepted `कैसी है तबियत???`, `गलत दवा`, and `कीजिए` as replacements for `कैसी है तबियत?`. These are fabricated probes, not claims about real provider output.
- The portable turmeric v4 notes explicitly record an earlier isolated edit bypassing grammar correction and replacing 38 fragments with 20 phrase-based cues. That multiline v4 SRT is rejected by the live single-line grammar parser (`Invalid SRT cue 1`); the sample's phrase-based change was not integrated into production.
- SRT-to-ASS normalizes Unicode and uses the existing Tiro style; its character-balanced line wrapping is not linguistic proofreading. Saved SRT errors exist before rendering. Visual glyph correctness was not reassessed here.
- Current correction inherits the planner provider and optionally overrides only its model. Existing history records the legacy Gemini configuration and unverified automatic v7.1 provider path. No provider was called. Done tracker rows are skipped; cache-valid corrected captions are reused, so a code update does not repair existing videos automatically.

## Verified
- `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js`: 4/4 pass. These test structure/chunking/numbers/cache and catalog behavior, not real Hindi proofreading quality.
- `node --check` on `video-broll-factory.js`, `caption-grammar.js`, `srt-to-styled-ass.js`: pass.
- Local read-only comparison and validator probes above succeeded. Tracker still has two done rows; Docker Linux engine and vector service on port 8766 were unavailable. Configuration inspection printed variable names only.

## Not verified / limits
- No listening review, new transcription, text-provider request, render or font/frame review. No tracker, schedule, publisher, media, environment or finished-caption changes. No new dependency.

## Open questions / next step
- Implement abbreviation-aware cue boundaries and a project spelling glossary, define sentence punctuation rules and test against saved Hindi samples. Phrase regrouping/readability changes require explicit agreement because existing timing/style must be preserved.
- Validate one isolated sample through an authorized non-Gemini text path and compare captions against source audio. Re-render affected completed videos separately from original input once their captions are approved.
