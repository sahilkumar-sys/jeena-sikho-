# B-roll isolated end-to-end test (diabetes sample) — Claude, 2026-10-07

Branch/PR: `claude/broll-phase3`, PR pending

## Request
Pick a random video from `Downloads\s`, test the whole flow (does Quality stop for B-roll, inbox, etc.) and explain how the project works overall.

## Setup (isolated; no paid provider, no render)
- Random pick among the five videos with a saved ElevenLabs transcript: `Avatar Video_720p (2).mp4` (diabetes, 50.9 s, 146 words; transcript from the earlier Codex sample, matched to this file by its manifest). Others had no transcript.
- Scratch project copy (1.6 GB gallery + index copy, product/reference photos via read-only junctions), private tracker/output, test vector service (new code) on port 8767, real factory `runBatch` (now exported) on Windows without the Linux lock. A local stand-in on 127.0.0.1:8799 replaced the text AI: captions returned unchanged, English phrase queries and the B-roll plan written by Claude in advance. `ASSEMBLER_SCRIPT` pointed at a stub that stops at the render step.

## Results
- Run 1 Quality: 13 phrases; vector shortlist found an approved video for 3. Fit check kept B002 (0.24) and B006 (0.23). Stopped before images/render: tracker `needs_broll`, `envato-needed.md` with 5 moments (tablet, insulin, junk food, glucometer, vegetables — the last because the plan used an AI still), inbox + README created; n8n summary correct.
- Run 2 Quality after dropping 3 of the user's own clips (`b rolls\d4` insulin pen, `d5` donuts, `c4` salad) plus a duplicate and a zero-filled file: imported E0001–E0003, rejected duplicate and broken file with reasons, `/refresh` 19→22 clips, re-planned. Fit check kept E0002 (moved, 0.18) but dropped E0001 (0.117) and E0003 (0.120); stopped again with 4 moments.
- Run 3 Quantity (`retry=yes`): no AI call (plan re-used), 4 local visuals (3 video, 1 HIIMS photo, 0 stills), contact sheet + review built, reached the render step (stub).
- Live folder, tracker, index and the user's Downloads files unchanged.

## Bugs found and fixed (committed)
- Fit check judged a shot starting on a new phrase against the previous phrase (0.25 s tolerance) and dropped a correct clip; `phraseAt()` fix + regression test.
- n8n summary did not match Windows paths by file name; Envato search phrases could end on a filler word.

## Open finding (not fixed; needs a user decision)
- Clips without descriptive file names (user-renamed `a1`, `c4`, Panchakarma `C0166`) lose the 0.2 keyword + part of the title weight, so true matches score 0.12–0.18 against a 0.18 keep floor tuned on descriptive names. Measured visual-only: true matches 0.073–0.171, wrong pairs ≤ 0.056. Options: keep Envato's original names (they describe the clip); label each inbox clip with the moment it best fits; or score name-less clips on the picture with their own floor (needs calibration).
- Switching a waiting job to Quantity needs `retry=yes`; decide whether Quantity runs should pick up `needs_broll` jobs automatically.

## Not verified
- Real planner/translation LLM (Claude stood in), caption correction, ElevenLabs, render, n8n/Docker.
