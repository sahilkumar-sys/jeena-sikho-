# Subtitle spelling and punctuation fixes — Codex, 2026-10-07

Branch/PR: `codex/subtitle-fix` (from `claude/session-log-rule` at `593b0be`), none

## Request
Fix the subtitle issues found in the audit and update documentation so other LLMs know what changed. This authorizes the narrow title/cue regrouping needed for the reported `Dr.` problem; original source word timing and the short-caption style remain.

## Done
- Snapshotted `video-broll-factory.js`, `caption-grammar.js`, `caption-grammar.test.js` in `versions/pre-subtitle-fix-2026-10-07/` before edits.
- Added `caption-policy.js` and the reviewed `caption-glossary.json`. `Pa`/`Ma` normalize to `Paa`/`Maa` beside a title or `Kit`, including across cues. Unrelated occurrences stay unchanged. No dependency added.
- Fixed sentence detection to distinguish title periods and reserve space for title/name pairs within the existing 2–3-word limit. New cues still start/end at source word timestamps; no general timing padding or longer-phrase mode.
- Added deterministic punctuation cleanup and explicit sentence-aware provider instructions. Chunks receive three corrected previous and three next cues plus the glossary. No automatic period is appended to every fragment.
- Strengthened validation to reject lexical word additions/deletions, unrelated rewrites, protected-name and negation changes, unsafe text, and changed numeric signs/separators/ranges/percentages. Allows case, matra/nukta variants and single spelling edits in longer words; larger changes stop for audio review.
- Bumped correction cache version from 2 to 3 and included the complete glossary in the fingerprint. Old cache results cannot bypass the new pass when a job actually runs; completed jobs remain skipped.
- Added regression tests; updated `AGENTS.md`, architecture, handoff, roadmap, both milestone histories, and new `docs/CAPTIONS.md`. Preserved the earlier audit log and the other agent's B-roll review notes.

## Verified
- `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js`: 13/13 pass.
- Syntax checks for runner, grammar, policy, ASS conversion and publisher; `git diff --check`: pass.
- Isolated local stub-provider fixture: `processed/subtitle-fix-validation-2026-10-07/horizontal-example/` contains raw/corrected SRT and `validation.json`. Saved horizontal transcript: 60 old cues → 57 new cues, four standalone `Dr.` cues → zero, three local `Pa` → `Paa` fixes, correction timestamps preserved and validation round-trip passed.
- All 23 top-level saved transcript/SRT jobs passed an in-memory run of the updated builder, local stub-provider correction and cue timing checks; zero failures, provider calls or output writes from this broader compatibility check.

## Not verified / limits
- No real text/image provider, new ElevenLabs transcription, listening review, font/frame review or render. Docker Linux engine and vector service remain unavailable. No environment/queue/schedule/publisher/media/finished-output change.
- Linguistic accuracy is still not proved by code: close spelling/matra edits may change meaning. Tiny non-title cues remain possible under the preserved style/pause rules. The standalone multiline turmeric v4 style is not integrated.

## Open questions / next step
- Validate an authorized non-Gemini provider pass against audio and rendered frames before claiming end-to-end caption quality. Review any larger spelling correction rejected by the conservative validator and add only evidence-backed glossary entries.
- Re-render affected completed reels separately from original input after caption approval. Review the source branch in a PR before any merge to `main`.
