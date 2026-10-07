# B-roll Phases 3–5 (Quality/Quantity, inbox import, n8n report) — Claude, 2026-10-07

Branch/PR: `claude/broll-phase3` (worktree `..\heygen-claude-broll-phase3`, branched from `claude/broll-phase1` at `7feadb4`), PR pending

## Request
Check/resume the Panchakarma index, then build Phase 3 (Quality/Quantity chosen in n8n), Phase 4 (inbox import of user-downloaded Envato clips) and Phase 5 (n8n report) from `docs/BROLL-PLAN.md`. No Gemini/paid provider, no render, n8n schedule off. Ask before new CSV columns or if the missing-beat rule is unclear.

## Done
- Panchakarma index: 326/1,305 indexed, then the E: drive dropped out at 16:11 (USB reset; every read returned "I/O device error", 957 copies failed). Not resumed. 22 genuinely damaged files (zero-filled header; one undecodable) listed to the user. A concurrent Claude session in `..\heygen-claude-broll` committed the stop-on-drive-failure fix (`7feadb4`), so this work moved to its own worktree/branch.
- User decisions (in `docs/DECISIONS.md`): only important moments count as missing (planner lists them; greetings/filler never); Quality mode does not accept generated stills.
- Phase 3 `broll-mode.js` + factory: `--broll-mode`/`BROLL_MODE` (default quantity); missing beats = fit-check dropped/weak + generated stills + planner `missing_beats` not covered by a shot; `envato-needed.md/.json` (both modes; optional in Quantity); Quality stops before images/render with tracker status `needs_broll` (no new column) and `broll-inbox/<job-id>/README.txt`; re-runs on inbox clips or `retry=yes`. Quality re-runs a skipped fit check and fails clearly if it cannot. Plan cache v11; mode deliberately not in the plan key (switching mode re-uses the plan). `finishJob`/`applyResultToRow`/`batchReport` extracted for tests.
- Phase 4 `broll-inbox-import.js`: age/header/ffprobe/≥2.5 s/SHA-256 dedupe checks, verified copy to `broll-assets/inbox/<job-id>/`, `E####` IDs in the local map + approvals, `broll-assets/approval-log.jsonl`, user file → `imported/` or `rejected/` (+reason); environment errors leave the file. Service `POST /refresh` runs `index_clips.py` on the project gallery and swaps the clip snapshot; catalog `reload()`; plan key approval fingerprint forces a re-plan.
- Phase 5: n8n Set node `broll_mode`; report node treats `needs_broll` as ok and writes a plain-English `summary` (rendered/not rendered, list path, inbox, moments with Envato search words, inbox results, other waiting jobs).
- Rollback: `versions/pre-broll-phase3-5-2026-10-07/`.

## Verified
- `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js broll-retrieval.test.js broll-fit-check.test.js broll-mode.test.js broll-inbox-import.test.js n8n-workflow.test.js`: 45/45 (inbox tests make real ffmpeg clips). JS syntax checks and Python `py_compile` pass. CI updated to run the new tests.
- Isolated live `/refresh` check on port 8767 (real SigLIP2 on GPU, copy of the project index, temp project with 3 clips): a dropped "hospital reception" clip imported as E0001, refresh 3→4 clips in 16 s, `/search` ranked it first (0.23), `/verify` scored it. Test service stopped; live folder unchanged.

## Not verified / limits
- No planner LLM call (the `missing_beats` instruction is untested against a real model), no render, no n8n run (Docker Linux engine unavailable; workflow JSON checked statically by running its node code).
- The live service on 8766 runs old code: after merge restart `Start-Vector-Retrieval.cmd` for `/verify` and `/refresh`. Without it, Quality mode fails clearly (no fit check) and imports log a refresh warning.
- `/refresh` is reachable wherever the service binds (`0.0.0.0` in `Start-Vector-Retrieval.cmd`); it takes no input and only re-indexes the project gallery.

## Open questions / next step
- Merge order: … → `claude/broll-phase1` → `claude/broll-phase3`. Then restart the vector service and try one Quality-mode sample with an authorized non-Gemini planner.
- Resume Panchakarma indexing only after the user has checked/backed up E: (command in `docs/BROLL-PLAN.md`).
