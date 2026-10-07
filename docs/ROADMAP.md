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

## Next

- Review PR #1 and its GitHub Actions result before merging to `main`.
- Build and run the new clone Docker stack on a machine with a working Linux engine, then verify model indexing and one isolated non-Gemini render with real keys, source audio, captions, output format, and representative frames. The local Docker engine was unavailable for that check.
- Resolve the unattended still-image provider choice. If OpenAI Images API is authorized, its key and explicit bootstrap confirmation enable unattended stills; otherwise use Codex image generation in an agent-assisted sample. Do not silently use Gemini.
- Implement and validate the full B-roll sourcing order recorded at the top of `PROJECT.md` and `Future Vector Embedding Update.md`. Confirm rights and frame fit before approving new assets.
- Decide whether a controlled shared media store is needed for collaborators; Git deliberately excludes large licensed/private media and local runtime state.
- A new clone needs only separately supplied media and API keys for its private inputs; the bootstrap builds its runtime. Keep licensed media and private keys outside Git.
