# Roadmap

Updated: 2026-10-08

## Completed (all in `main`)

- Git baseline, agent branch/worktree rules, three-tier context (`docs/HANDOFF.md`, `docs/sessions/`, dated histories), PR checks (Node tests, syntax, PowerShell clone smoke test).
- Fresh-clone bootstrap (`Bootstrap-From-Git.ps1`, `runtime/clone/`) with local approval overlays; fixed for Windows PowerShell 5.1.
- Subtitle fixes: abbreviation-aware cues, contextual glossary, punctuation, faithful-correction checks (cache v3).
- B-roll Phases 1–5: 1 fps search + match floor, fit check, Quality/Quantity mode in n8n with `needs_broll` and Envato list, inbox import with provenance and `/refresh`, n8n summary.
- Isolated end-to-end tests and a rendered diabetes example from the user's labelled clips (8 Oct).
- Merged to `main` (PRs #1–#3, 8 Oct); live folder switched to `main`.

## Next

1. Restart `Start-Vector-Retrieval.cmd`; check `/health`, `/verify`, `/refresh`.
2. One isolated sample with an authorized non-Gemini text provider (planner, translation, caption proofreading), source-audio listening and frame review. Then decide whether to activate the n8n schedule.
3. User decisions: clip naming (keep Envato names / auto-label inbox clips / picture-only floor); whether Quantity picks up `needs_broll` jobs automatically.
4. Split long two-idea sentences before translation so each idea gets its own fit check.
5. More examples from the user's labelled sets (asthma a1–a8, blood pressure b1–b7, constipation c1–c6, fatty liver f1–f8).
6. E: drive: user checks/backs up; then resume the Panchakarma index (326/1305) and review E:/Panchakarma clips as approval candidates.
7. Later: search existing photos before generating a still; remove legacy Gemini defaults from `plannerSettings`/`imageSettings`; verify the clone Docker path on a machine with a working Linux engine; decide on a shared media store for collaborators.
