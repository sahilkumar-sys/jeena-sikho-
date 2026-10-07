# Production v7.1 — caption correction, 5 October 2026

This snapshot contains the live factory source after the subtitle correction change. The Desktop project is not a Git repository. It is bind-mounted into n8n when Docker runs. The n8n workflow export, live tracker rows, publisher, existing renders and schedule were not changed.

The pre-change live files are in `../pre-caption-correction-2026-10-05/`. To roll back **after a running factory job finishes**, copy `video-broll-factory.js`, `video-broll-factory.env.example`, `PROJECT.md` and `Future Vector Embedding Update.md` from that folder to the project root. The added `caption-grammar.js` may remain unused after rollback. No secrets were included in these snapshots.

v7.1 calls the existing LLM provider after ElevenLabs transcription to proofread captions. `captions.raw.srt` and `captions.srt` distinguish raw and corrected text. It validates cue order, timestamps, numeric strings and text length; failed correction stops the job. The correction is cached by raw text and model settings. Tests passed locally; a live Gemini/Docker render was unavailable at promotion.

The separate E: ten-frame indexing run and its outputs live under Documents/Codex, outside this production snapshot. The entire `All panchkarma therepy` folder remains excluded from that run.
