# Roadmap

Updated: 2026-10-07

## Completed

- Initialized local Git history with a source-only first commit on `main`.
- Added agent branch/worktree rules, short architecture and handoff docs, and PR test automation.
- Connected `origin` and published `main` plus `codex/multi-agent-setup` after the user granted GitHub write access and authorized a public push.
- Opened PR [#1](https://github.com/sahilkumar-sys/jeena-sikho-/pull/1) for review; it is unmerged.
- Documented the exact fresh-clone boundary and required controlled asset copy in `docs/CLONE-SETUP.md`.
- Added a Windows fresh-clone bootstrap that imports supplied media, preserves nested B-roll folders, creates private non-Gemini settings after explicit image-provider authorization, and prepares Docker-based n8n and optional CPU vector retrieval. Added local approved-media overlays and offline PR tests.
- Added a tiered agent-context rule (short `docs/HANDOFF.md`, per-session logs in `docs/sessions/`, milestone-only history entries) and condensed duplicate 7 October history entries (branch `claude/session-log-rule`).
- Audited subtitle issues against live code and saved outputs (`codex/subtitle-audit`): 23 top-level captions match raw generation; confirmed abbreviation splitting, very short cues and linguistic-validation gaps. Four focused tests pass. Findings only; runtime unchanged. See `docs/sessions/2026-10-07-codex-subtitle-audit.md`.
- Implemented subtitle fixes on `codex/subtitle-fix`: abbreviation-aware short cues, contextual product glossary, punctuation cleanup, conservative wording/name/negation/numeric checks and glossary-aware cache version 3. Thirteen tests pass; the isolated saved horizontal transcript now has 57 cues and zero standalone titles. See `docs/CAPTIONS.md`; no real provider or render validation yet.

## Next

- B-roll (user goal: all-video, at most 2 generated stills). Phases 1–2 (search, fit check) on `claude/broll-phase1` and Phases 3–5 (Quality/Quantity in n8n, `needs_broll` + Envato list, inbox import with `/refresh`, n8n summary) on `claude/broll-phase3` were merged into `main` on 8 Oct (PR #2). Next: switch the live folder to `main` when Codex is idle, restart `Start-Vector-Retrieval.cmd`, run one isolated Quality-mode sample with an authorized non-Gemini planner (checks the new `missing_beats` output). Later: review the Extended library and E:/Panchakarma as approval candidates; existing-still search.
- E: reports Full Repair Needed (exFAT dirty) and dropped out with I/O device errors during Panchakarma indexing (326/1305 done). The user should reconnect/check the drive and back up before `chkdsk E: /f`; agents only read E:. Resume the Panchakarma index afterwards (command in `docs/BROLL-PLAN.md`).

- Verify one isolated subtitle sample with an authorized non-Gemini text provider, source-audio listening and representative rendered frames. Review larger spelling corrections that the conservative validator rejects; extend the glossary only with evidence. Existing completed videos need separate caption approval and re-rendering. Longer phrase grouping and general minimum readable duration remain separate editorial changes; conservative text checks cannot prove linguistic accuracy.
- Review PR #1 and its GitHub Actions result before merging to `main`.
- Build and run the new clone Docker stack on a machine with a working Linux engine, then verify model indexing and one isolated non-Gemini render with real keys, source audio, captions, output format, and representative frames. The local Docker engine was unavailable for that check.
- Resolve the unattended still-image provider choice. If OpenAI Images API is authorized, its key and explicit bootstrap confirmation enable unattended stills; otherwise use Codex image generation in an agent-assisted sample. Do not silently use Gemini.
- Implement and validate the full B-roll sourcing order recorded at the top of `PROJECT.md` and `Future Vector Embedding Update.md`. Confirm rights and frame fit before approving new assets.
- Decide whether a controlled shared media store is needed for collaborators; Git deliberately excludes large licensed/private media and local runtime state.
- A new clone needs only separately supplied media and API keys for its private inputs; the bootstrap builds its runtime. Keep licensed media and private keys outside Git.
