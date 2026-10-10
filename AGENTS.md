# Instructions for an LLM working on this project

This file is the shared policy for every coding agent (Codex/GPT, Claude, or others); `CLAUDE.md` only includes it. This is the live, portable Heygen video factory. Resolve the project root from this file's directory; do not assume a fixed Windows user or drive path. The project is bind-mounted into Docker at `/files/heygen-workflow`. Git `main` is the reviewed source baseline. Reply to the user in plain, simple English: they forward short WhatsApp-style summaries, so lead with the result, avoid jargon, and say clearly what was and was not verified.

## Shared project workflow

- Before any task, read `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/HANDOFF.md`, then the newest dated sections of the two project histories below. For any B-roll work, also read `docs/BROLL-PLAN.md` and `docs/DECISIONS.md`. Open a `docs/sessions/` log only when the handoff points to it or your task touches that area. If documentation and code disagree, trust the code and fix the documentation.
- Work on a separate branch named `<agent-name>/<task>` created from `main`; never implement directly on `main`. Use a separate Git worktree when agents work concurrently (the live folder may be in use by another agent). Merge to `main` only through a reviewed pull request whose GitHub checks pass.
- GitHub: `origin` is the **public** repository `https://github.com/sahilkumar-sys/jeena-sikho-`. Pushing publishes. The user does not give agents GitHub web access and `gh` is not installed: push the branch with the git credential saved on this PC, then give the user the PR link plus a ready-to-paste title and description; read PR and check status from the public GitHub API. Ask before pushing work that is not yours.
- Keep work scoped. Ask before adding dependencies, adding CSV columns, or touching unrelated modules. Never commit secrets.
- Before finishing a session, run the relevant tests and update `docs/HANDOFF.md` and `docs/ROADMAP.md` with actual status and next steps.
- **Leave context for the next agent, in three tiers, so it stays cheap to read:**
  1. `docs/HANDOFF.md` (always read): the *current state*, not a diary. Rewrite or replace stale bullets instead of appending; keep it under about 80 lines. Link to the session log for details.
  2. `docs/sessions/YYYY-MM-DD-<agent>-<task>.md` (read only when relevant): one short file per session using the template in `docs/sessions/README.md` — request, what changed, what ran and its result, what was not verified, open questions. Write it even for read-only or aborted sessions if a decision or finding came out of it.
  3. `PROJECT.md` and `Future Vector Embedding Update.md` (newest section only): one dated entry per *material milestone* (behaviour, provider, approval, or retrieval change), not per session.
- Commit messages and PR descriptions are also context: say what changed and why.
- Git is the source of truth for code, catalogs, rules, and handoffs. Large licensed/private media, live tracker state, renders, runtime data, and credentials are local and ignored by Git.

## Stack, map, and commands

- Node.js 24 (local 24.13.1), built-in `node:test`, no npm package manifest; Python 3.11 for SigLIP2 retrieval (`runtime/vector-cache/venv/Scripts/python.exe`; Python is not on PATH); n8n 2.40.5 and FFmpeg in Docker. Windows PowerShell 5.1 is the user's default shell (CI uses PowerShell 7): avoid version-specific behaviour, e.g. wrap `ConvertFrom-Json` pipelines in parentheses before `@()`.
- Factory and B-roll: `video-broll-factory.js` (runner, planner, tracker), `vector-retrieval-client.js` + `vector-retrieval-service.py` (search, `/verify`, `/refresh`), `broll-fit-check.js` (shot fit check), `broll-mode.js` (Quality/Quantity, missing moments, Envato list, inbox README), `broll-inbox-import.js` (user-dropped clip import), `broll-review-sheet.js`, `local-media-catalog.js`, `broll-usage-ledger.js`, `speech-duration-planner.js`, `render-mixed-broll.js`, `video-broll-factory-workflow.json` (n8n). Captions: `caption-grammar.js`, `caption-policy.js`, `caption-glossary.json`. `vector-index/index_clips.py` builds indexes. `publishing/` is a separate approval-gated publisher. `runtime/n8n/` holds the portable Compose; `runtime/clone/` the fresh-clone setup. `docs/` is the short shared context.
- Fresh GitHub clone: `./Bootstrap-From-Git.ps1 -MediaRoot 'C:\path\to\media'` (see `docs/CLONE-SETUP.md`). Existing complete portable folder: `./Setup-Portable.ps1` and `./Start-Heygen.ps1`. Start the search service alone with `Start-Vector-Retrieval.cmd` (port 8766).
- Tests: `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js broll-retrieval.test.js broll-fit-check.test.js broll-mode.test.js broll-inbox-import.test.js n8n-workflow.test.js envato-links.test.js` (51 pass), `./runtime/clone/Test-Bootstrap.ps1` and `./Collect-Envato-Downloads.Test.ps1`. Syntax: `node --check video-broll-factory.js` and `node --check publishing/meta-publisher.js`. CI runs these on PRs.
- Use CommonJS and built-in Node APIs. Keep paths relative to the project root. Preserve existing CSV headers and output formats, fail on invalid plans, and do not silently change media approvals or caption timing.

## What the project does

- `incoming/` holds finished presenter videos. The factory transcribes the existing speech (ElevenLabs), builds and corrects short captions, plans speech-aligned B-roll, and renders a 1080×1920 H.264/AAC MP4. It does not create the presenter performance.
- Per job: transcript → captions → spoken phrases translated to short English visual descriptions → local vector search over **approved** clips → LLM plan (shots + `missing_beats`) → fit check of the exact seconds of every video shot (keep / move / swap / drop / weak) → **Quality/Quantity decision** → images (only generated stills cost money) → review sheet → render.
- `video-control.csv` is the authoritative queue and retry tracker. Statuses: `pending`, `processing`, `done`, `failed` (needs `retry=yes`), and `needs_broll` (Quality mode waiting for clips; re-run when its inbox has clips or on `retry=yes`). Do not edit the CSV during a run or delete its lock file while it may be active.
- `processed/<job>/` holds `transcript.json`, `captions.raw.srt`, `captions.srt`, `broll-plan.json` (with `fit_check`, `coverage`, `retrieval`), `envato-needed.md/.json`, `broll-review.md`, `broll-contact-sheet.jpg`, the manifest and the final MP4. A render request does not authorize posting.
- `versions/` contains rollback snapshots; changing a snapshot does not change live code.

## B-roll rules (user decisions, 7–8 October 2026; supersede older 70/30 notes)

- Goal: **100% video B-roll**. Generated stills only in dire cases, **at most 2 per reel** (`BROLL_MAX_GENERATED_STILLS`). Exact real photos (named product pack, YouTube/Facebook profile, HIIMS hospital) do not count. If nothing fits, the presenter stays on screen. **Never generate video B-roll.**
- Mode is chosen per run in n8n (`broll_mode`, CLI `--broll-mode`, env `BROLL_MODE`; default `quantity`). **Quantity** always renders (best approved video → up to 2 stills → presenter) and writes an optional Envato list. **Quality** stops before any image/render cost when an *important* moment lacks a good video (planner-listed `missing_beats`, fit-check `dropped`/`weak` shots, or a would-be generated still), sets `needs_broll`, writes `envato-needed.md`, and creates `broll-inbox/<job-id>/`. Greetings/filler never count. The plan is mode-independent, so switching a waiting job to Quantity re-uses it.
- Envato Elements (the user's subscription) has no public download API and its Fair Use Policy forbids scripted/bot downloading: **never automate Envato login or downloads, and never ask for the Envato password.** When Quality stops, `envato-links.js` writes `Open-Envato-Links.cmd`, `envato-links.html` and `envato-moments.json` into the job inbox (links: `https://elements.envato.com/stock-video/<slug>/orientation-vertical`). Double-clicking the .cmd opens every search in the user's browser and starts `Collect-Envato-Downloads.ps1`, which only moves finished downloads from the user's Downloads folder into the inbox, named `<moment>-<slug>--<Envato name>`.
- A clip the user drops into `broll-inbox/<job-id>/` **counts as approval** (licence and people check by the user). The importer checks it, copies it to `broll-assets/inbox/<job-id>/`, gives it an `E####` ID in the ignored `broll-assets/local-asset-map.json` and `local-approved-stock-ids.json`, logs provenance in `broll-assets/approval-log.jsonl`, refreshes the index, and the job is re-planned. Advise **descriptive file names** (Envato's own names): clips named `c4`/`C0166` lose about a third of their score and usually fall below the 0.18 keep floor.
- Select stock only through `approved-stock-ids.json`, the local overlays, and `local-media-catalog.js`. Indexed ≠ approved. Match named products to their actual images in `product-assets/`; never invent packaging or present illustrative footage as proof of a health claim.
- Never reuse a video, photo, or audio asset within one reel (enforced by path/byte); near-duplicate re-encodes still need review. Across reels prefer fresh clips (`broll-usage-ledger.js`), but fit outranks novelty.
- Shots are 2.1–4.2 s, start ≥ 3.6 s apart, with ≥ 1.5 s of presenter between them. Preserve source audio and the approved framing/caption style.
- Thresholds: match floor 0.18 (`BROLL_MIN_MATCH_SCORE`), drop floor 0.14 (`BROLL_DROP_BELOW_SCORE`); scores are rank scores, not fit percentages.

## Captions

- `caption-grammar.js` runs after ElevenLabs transcription with abbreviation-aware cue building, `caption-policy.js` and the reviewed `caption-glossary.json`. Correction must preserve cue indices/timestamps, numeric literals, word order, names, negations and meaning. Keep `captions.raw.srt` unchanged. See `docs/CAPTIONS.md` (cache version 3). Review Hindi spelling, names and medical terms against audio; validation cannot prove accuracy.

## Provider boundary

- **Do not use Gemini services.** Use ElevenLabs for transcription; text/image providers only when the user authorizes them. The legacy portable `.env` is Gemini-configured: do not start a full provider-driven run with it. The clone bootstrap creates a separate OpenAI configuration only after explicit authorization. Never print or copy values from `runtime/n8n/.env`.
- No real planner-LLM or caption-proofreading call has been verified with the new B-roll flow. Isolated samples so far used a local stand-in for the text AI; see the newest `docs/sessions/` logs. Do not describe a stand-in run as an end-to-end provider test.

## Retrieval and gallery

- Approved project gallery: `broll-assets/` (plus `broll-assets/inbox/` imports). Index `vector-index/local-clips.sqlite` (version `siglip2-base-1fps-v2`, 1 frame/s); model and venv under `runtime/vector-cache/`. `Start-Vector-Retrieval.cmd` starts the service; it serves `/search`, `/verify` (fit check from stored vectors) and `/refresh` (indexes new gallery clips and reloads). Without the service, search falls back to keywords, the fit check is skipped, and Quality mode fails clearly.
- `E:\Envato Stocks` is a separate, unapproved gallery (index `runtime/vector-cache/index/envato-1fps.sqlite`, 246/247). **Exclude `E:\Envato Stocks\All panchkarma therepy` from ordinary E: work**; at the user's request it has its own index `panchkarma-1fps.sqlite` (326/1305, stopped when the E: drive failed). **E: is read-only and unhealthy: do not scan or resume indexing until the user confirms the drive is checked.** Never send thousands of clip descriptions to an LLM; retrieve a short candidate list locally.

## Safe working sequence

1. Confirm the request, current code, queue state, Docker state, and whether the vector service is running. Read configuration variable **names/presence** only.
2. For code changes, keep a rollback copy under `versions/`, work on a branch, and run the tests above. Keep the n8n schedule inactive unless the user asks.
3. For a sample, use an isolated project copy, tracker and output (pattern: `docs/sessions/2026-10-08-claude-broll-diabetes-example.md`). Do not change completed `processed/` files or live CSV rows. Reuse a valid saved ElevenLabs transcript when possible.
4. Validate asset IDs, timing, uniqueness, audio, captions and output with `ffprobe` and frame review (1080×1920 H.264/AAC, source-length). Report what ran and what did not.
5. Write the session log, refresh `docs/HANDOFF.md`, and for material changes the top of `PROJECT.md` and `Future Vector Embedding Update.md`.
