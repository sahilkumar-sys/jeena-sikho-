# Handoff

Updated: 2026-10-07 (Asia/Kolkata)

## Agent context rule

- Branch `claude/session-log-rule` adds a three-tier context rule to `AGENTS.md`: keep this file short and current, write one log per session in `docs/sessions/` (template in its README), and add `PROJECT.md` / vector-history entries only for material milestones. Details: `docs/sessions/2026-10-07-claude-session-log-rule.md`.
- B-roll flow review: ten findings in `docs/sessions/2026-10-07-claude-broll-flow-review.md`.

## B-roll Phase 1 (branch `claude/broll-phase1`, from `codex/subtitle-fix`)

- User decisions (see `docs/DECISIONS.md`): goal 100% video B-roll; at most 2 generated stills per reel, real product/social/hospital photos exempt; Quality/Quantity mode chosen in n8n; dropping a clip in a job inbox counts as approval.
- Built: 1 fps re-index with JSON progress (`--progress-file`, `Show-Index-Progress.cmd`); phrase-based search windows; calibrated match floor 0.18 (`BROLL_MIN_MATCH_SCORE`); 3-second window scoring and in-points in the service; keyword fallback with `BROLL_RETRIEVAL_WARNING` when the vector service is down (planner never loses the video catalog); generated-still cap enforced in `validatePlan` (`BROLL_MAX_GENERATED_STILLS`, default 2); B-roll mix in `plan.coverage`; `broll-contact-sheet.jpg` + `broll-review.md` per job before render. Fixed: shortlist dropped clone-imported `U####` IDs. Plan cache version 9 forces re-planning.
- Indexes (ignored, local): project gallery re-indexed 56/56 at 1 fps in `vector-index/local-clips.sqlite` (backup `vector-index/local-clips.pre-1fps-2026-10-07.sqlite`). E: `Envato Stocks` (Panchakarma excluded, ~5 GB, one chunk) indexed into `runtime/vector-cache/index/envato-1fps.sqlite`; E: was only read. E: clips remain unapproved and unused by production. At the user's request the `All panchkarma therepy` folder (1,305 videos, ~210 GB, 11 chunks) is being indexed separately into `runtime/vector-cache/index/panchkarma-1fps.sqlite` (progress: `runtime/vector-cache/logs/progress-panchkarma.json`); resumable if interrupted.
- Not built yet: fit check (Phase 2), Quality/Quantity modes, Envato-needed list and inbox import, n8n `broll_mode` field. Not verified: real planner LLM call, render, n8n. The live service runs the old service code until this branch is merged and `Start-Vector-Retrieval.cmd` is restarted (old code is compatible with the new index).
- Details: `docs/sessions/2026-10-07-claude-broll-phase1.md`.
- Phase 2 fit check (same branch): service `/verify` + `broll-fit-check.js` keep/move/swap/drop each planned video shot from stored 1 fps vectors; `plan.fit_check` and a Fit column in `broll-review.md`. Live-tested on port 8767 (carrot shot swapped to the harvesting clip, wrong lightning shot dropped). Needs merge + vector service restart to run in jobs. Details: `docs/sessions/2026-10-07-claude-broll-phase2-fit-check.md`.
- Panchakarma index: many originals on E: are damaged (zero-filled, no `ftyp` header; ~12% of chunk 1). The run skips and lists them.

## Fresh-clone bootstrap continuation

- On `codex/multi-agent-setup`, added `Bootstrap-From-Git.ps1` and `runtime/clone/` as a separate path for a new GitHub clone. A user supplies a media folder and ElevenLabs/OpenAI keys; the script imports media without overwriting, creates ignored local clip approvals after rights confirmation, creates a private non-Gemini `.env` after explicit OpenAI Images API authorization, and prepares Docker n8n plus optional CPU SigLIP2 indexing. The imported workflow remains inactive and automatic processing is false. No real provider call or render was made.
- Updated `local-media-catalog.js` and `vector-retrieval-service.py` to read ignored local approvals/maps; a changed local catalog invalidates the runner's cached plan. Original code snapshots are in `versions/pre-clone-bootstrap-2026-10-07/`. Media, live `video-control.csv`, existing `runtime/n8n/.env`, n8n schedule and publisher were not modified.
- Offline verification: four Node tests pass; PowerShell clone smoke test covers plan, media import repeat/conflict, and private environment creation with dummy keys; Node and Python syntax pass; Docker Compose configuration validates. The local Docker Linux engine is unavailable, so the image build, model download, indexing, n8n import and end-to-end render remain unverified. CI is configured to run Node tests and the PowerShell bootstrap smoke test on PRs.
- The user was asked whether unattended still generation may use the OpenAI Images API. No specific answer was recorded before this handoff. The bootstrap therefore requires an explicit `YES` at runtime (or `-UseOpenAIImages` only after that authorization). The prior instruction to use Codex image generation remains the default for an agent-assisted sample.
- The new clone path is documented in `README.md` and `docs/CLONE-SETUP.md`. The existing complete-folder `Setup-Portable.ps1` still requires its bundled runtime. The clone bootstrap does not implement the pending Extended/E: and Envato B-roll sourcing chain.
- The B-roll importer now preserves nested folders, so same-named clips in different subfolders get distinct local IDs and folder names remain available to vector search. The retrieval service matches approved clips by path relative to `broll-assets/`; the smoke test covers this case. A read-only call to `load_clips()` against the existing project index returned 19 approved indexed clips after the change; model inference was not started.

## Current work

- Subtitle fixes are live on `codex/subtitle-fix`: titles keep their names within short cues; contextual `Pa`/`Ma` spellings use `caption-glossary.json`; punctuation is normalized; correction rejects word drops/unrelated rewrites, protected-name/negation changes and changed numeric literals. Cache version 3 includes the glossary. Rollback: `versions/pre-subtitle-fix-2026-10-07/`. Rules: `docs/CAPTIONS.md`; session: `docs/sessions/2026-10-07-codex-subtitle-fix.md`.
- Verification: 13 focused tests and caption-related JS syntax checks pass. An isolated saved-transcript check changed 60 cues to 57, removed four standalone `Dr.` cues and corrected three `Pa` spellings; correction kept the new timings. This used a local identity-provider stub, not real LLM proofreading. No new provider, transcription, listening/frame review or render; tracker, finished outputs, schedule and publisher untouched. Audio review and a real authorized non-Gemini sample remain required.
- Prior audit found 23 older top-level caption files matching raw generation with no correction artifacts (`docs/sessions/2026-10-07-codex-subtitle-audit.md`). They remain unchanged. Tiny non-title cues and the separate multiline/phrase-based turmeric v4 style are still outside this fix; `done` jobs do not automatically rerun.
- Initial source baseline: `main` commit `bce4f21`. Collaboration setup branch: `codex/multi-agent-setup`.
- `origin` points to `https://github.com/sahilkumar-sys/jeena-sikho-.git`. GitHub reported `private=false` on 2026-10-07. The user explicitly authorized publishing both branches to this public repository. A pre-push check found no tracked credential, runtime, or media paths and no tracked file over 5 MB.
- The first push returned HTTP 403. After the user granted write access, `main` and `codex/multi-agent-setup` were pushed successfully on 2026-10-07. Both local branches now track their `origin/` counterparts. The setup branch is ready for PR review; it has not been merged.
- PR [#1](https://github.com/sahilkumar-sys/jeena-sikho-/pull/1) is open from `codex/multi-agent-setup` into `main`. It has not been merged. Review its diff and GitHub Actions result before merging.
- The earlier fresh-clone audit found that `Setup-Portable.ps1` assumed a complete portable folder. The new clone bootstrap above is the alternative path; it still needs user media and keys, Docker Desktop, and a verified first run.
- Root `AGENTS.md` is the agent policy; `CLAUDE.md` points to it. Read `docs/ARCHITECTURE.md` and this file before a task.
- Existing focused tests: `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js` (13 passing locally after subtitle fixes); PR CI also checks JavaScript syntax and the PowerShell clone smoke test. No npm install is required for these tests.
- Local Docker Linux engine and vector search service were unavailable during setup inspection. The existing tracker had two `done` rows. No render, provider call, publishing action, schedule activation, or tracker edit was performed.

## Boundaries and next action

- `runtime/n8n/.env`, media, local outputs, Python environment/model, n8n data, and live queue are ignored. For a new agent or machine, start with `docs/CLONE-SETUP.md` and the new bootstrap; it builds runtime dependencies rather than requiring a copy of the original bundled Python/model. Code-only tests need only Node.js 24 and PowerShell for the bootstrap smoke test.
- Do not run the existing Gemini-configured portable environment under the user's no-Gemini instruction. Verify the new non-Gemini clone path end to end on a machine with Docker Linux engine before production use.
- Review PR #1 and its checks, then merge only after review. Keep each agent on its own branch/worktree, then update this handoff and roadmap at session end.
