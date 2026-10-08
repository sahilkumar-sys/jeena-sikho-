# Diabetes example video (Quality mode, user-labelled clips) — Claude, 2026-10-08

Branch/PR: `claude/broll-phase3`, PR pending

## Request
Make one example video in Quality mode from `Downloads\s`, using the B-roll the user downloaded and labelled after Codex's shot list (`Documents\Codex\2026-10-05\...\outputs\eight-video-broll-shot-list.md`; `b rolls\d1–d7` = diabetes rows D1–D7).

## Setup
Same isolated harness as `2026-10-07-claude-broll-e2e-test.md` (scratch project copy, private tracker, test vector service on 8767, saved ElevenLabs transcript, local stand-in for the text AI with Claude writing translations and the plan after reading the real planner request). This time the real renderer ran. Inbox copies were given descriptive names from what Claude saw in each clip (`d4-hands-preparing-insulin-pen-injection.mov`), like Envato's own names; originals untouched.

## Results
- Quality run 1 (library only): stopped, 7 moments needed (= D1–D7).
- Run 2 (clips dropped): 7 imported as E0001–E0007, refresh 19→26 clips, re-planned with 9 visuals; 6 kept (0.23–0.35), donuts and sugar dropped. Cause: Claude's stand-in translations were unfaithful ("junk food on the sofa"; vegetables only for the merged vegetables+sugar sentence).
- Run 3 (translations corrected to the Hindi): kept 6, weak 2 (donuts 0.151, sugar 0.156; floor 0.18) → Quality correctly refused to render and listed 2 moments.
- Run 4 Quantity (same plan, no AI call): rendered. 1080×1920 H.264/AAC 25 fps, 50.92 s (= source), 9 visuals (8 video, 1 HIIMS photo, 0 stills), B-roll 45%. Frames reviewed. Copied to `Downloads\s\rendered videos\diabetes-example-claude-2026-10-08*.{mp4,jpg,md}`.
- Fixed: FFmpeg 8 failed on `d2.mov` (10-bit ProRes 422 with no colour transfer tag); renderer, review sheet and indexer now tag such clips BT.709 (commit on this branch).

## Findings / limits
- Descriptive clip names raised true-match scores from ~0.12 to 0.23–0.35 — confirms the name-scoring finding; still needs the user's naming decision.
- Phrase windows can merge two ideas in one sentence (vegetables + sugar); the fit check judges every shot in that window against one description, so the second idea's clip scores weak.
- Captions were the raw ElevenLabs cues (stand-in returned them unchanged; no proofreading). Planner, translation and captions were not a real provider. Live folder unchanged.
