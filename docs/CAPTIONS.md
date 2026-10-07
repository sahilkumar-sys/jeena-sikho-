# Subtitle correction and review

Updated: 2026-10-07. Live files: `video-broll-factory.js`, `caption-grammar.js`, `caption-policy.js`, `caption-glossary.json`.

## Flow

1. ElevenLabs returns word text and original start/end timestamps. The factory builds short 2–3-word cues from these words, sentence endings and pauses. Recognized titles such as `Dr.` and `डॉ.` keep their abbreviation period without ending a sentence; the builder reserves room for the following name. Real sentence stops and pauses over 0.42 seconds still split cues.
2. `captions.raw.srt` preserves the builder's original transcription spelling. Changing the builder can change the cue count for a newly processed/retried job, but words retain their original source timestamps. No global minimum-duration padding, longer phrase style, or cue merging in the correction stage was introduced.
3. `caption-policy.js` applies the reviewed glossary and punctuation normalization before the configured text-provider pass. `Pa`/`Ma` become `Paa`/`Maa` only directly next to `Dr`, `डॉ`, `Kit` or `किट`, including across cue boundaries. Unrelated occurrences remain unchanged. The glossary is small; add aliases only after checking audio and supplied product/reference evidence. Never infer a medical-term substitution from plausibility alone.
4. Correction requests contain 30 cues, three corrected preceding cues and three following cues, the glossary, and explicit punctuation rules. Short cue breaks are not sentence ends. Use one question mark for a clear question, a danda for a complete Hindi sentence, commas where warranted, and preserve English code-switching, titles and numeric punctuation. Keep uncertain wording unchanged.
5. Validation requires all original cue indices, same lexical word count/order, safe single-line text, numeric literals including signs/separators/ranges/percentages, protected names and negations. Case, Hindi matra/nukta differences and a single spelling edit in longer words are allowed. Hyphenated orthography is compared as lexical words. Larger spelling/grammar rewrites stop for editorial review instead of silently replacing speech. An invalid provider result is retried once; a second failure stops the job.
6. Local punctuation cleanup removes excess spaces before punctuation, adds missing spaces after selected punctuation, collapses repeated question/exclamation/danda/comma marks and renders repeated dots as an ellipsis. It does not add sentence endings to every cue or determine whether a sentence is a question.
7. The existing Tiro Devanagari Sanskrit/amber ASS style and source audio remain in use. Character-balanced visual line wrapping is separate from sentence/cue grouping.

## Cache and existing outputs

Correction cache version is 3. Its key includes raw SRT, provider, model, URL and the complete glossary, so old correction results and changed glossary policies trigger a new correction pass for jobs that actually run. Bump the correction version when changing other correction/normalization behavior. `REUSE_EXISTING_CAPTIONS=false` forces a pass, but does not make a `done` tracker row run: completed jobs are skipped. An existing MP4 has burned-in text and needs a separate approved re-render from original input; changing an SRT alone does not repair that MP4. Preserve original completed outputs and use an isolated input/tracker/output for review.

## Provider boundary and review limits

The correction stage still inherits the configured planner provider and uses `CAPTION_LLM_MODEL` only as a model override. Do not load the legacy Gemini configuration for a run under the user's no-Gemini instruction. These code changes do not authorize a new destination or switch providers, start a schedule, render a queue, or publish a video. Validate a real correction run using an authorized non-Gemini text path when available.

The validator is a conservative text check, not an audio recognizer or semantic proof. Matra changes and close spelling edits can still change meaning; homophones, medicine names, units, questions and proper names need listening review. Unknown spellings are not covered by the small glossary. Tiny cues unrelated to abbreviations can still occur with the preserved short-caption style and pause rules. The separate multiline/phrase-based turmeric v4 sample is still outside the live single-line correction parser.

## Verification

Run `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js` and syntax-check `video-broll-factory.js`, `caption-grammar.js`, `caption-policy.js`. Thirteen focused tests passed on 7 October; coverage includes faithful spelling, punctuation cleanup, title grouping, name/negation/number protection, unsafe output, retries, chunk context and cache invalidation.

The isolated local fixture at `processed/subtitle-fix-validation-2026-10-07/horizontal-example/` rebuilt the saved horizontal transcript: 60 old cues became 57, four standalone `Dr.` cues became zero, and three `Pa` spellings became `Paa`. `validation.json` records that correction preserved the new cue timings. It used an identity-provider stub; no text-provider call, transcription, listening review, ASS frame check or render was performed. This ignored fixture is not included in a fresh Git clone. See `docs/sessions/2026-10-07-codex-subtitle-fix.md` for session status and rollback.

The same offline builder/correction/timing check passed for all 23 top-level saved transcript/SRT jobs without modifying their files. This establishes local compatibility, not real provider proofreading accuracy.
