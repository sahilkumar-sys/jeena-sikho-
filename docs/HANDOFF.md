# Handoff

Updated: 2026-10-07 (Asia/Kolkata)

## Start here for B-roll work

- Read `docs/BROLL-PLAN.md`: user decisions, phase status, where the code and runtime are, and how to resume the Panchakarma index. Phases 1–2 are on `claude/broll-phase1` (worktree `C:\Users\js19187\Desktop\heygen-claude-broll`); Phases 3–5 are on `claude/broll-phase3` (worktree `C:\Users\js19187\Desktop\heygen-claude-broll-phase3`, built on top of phase1). Neither is merged; the live folder does not contain them yet.

## Agent context rule

- Branch `claude/session-log-rule` adds a three-tier context rule to `AGENTS.md`: keep this file short and current, write one log per session in `docs/sessions/` (template in its README), and add `PROJECT.md` / vector-history entries only for material milestones. Details: `docs/sessions/2026-10-07-claude-session-log-rule.md`.
- B-roll flow review: ten findings in `docs/sessions/2026-10-07-claude-broll-flow-review.md`.

## B-roll (branches `claude/broll-phase1` → `claude/broll-phase3`, unmerged)

- User decisions (`docs/DECISIONS.md`): goal 100% video B-roll; at most 2 generated stills per reel (real product/social/hospital photos exempt); Quality/Quantity chosen per run in n8n; a clip dropped in a job inbox counts as approval; in Quality mode only important moments count as missing and generated stills are not accepted.
- Phase 1 (search): 1 fps re-index, phrase-based queries, match floor 0.18, window scoring, keyword fallback, still cap, B-roll mix, contact sheet + `broll-review.md`. Phase 2 (fit check): service `/verify` keeps/moves/swaps/drops each planned shot. Details: `docs/sessions/2026-10-07-claude-broll-phase1.md`, `...-phase2-fit-check.md`.
- Phases 3–5: `--broll-mode`/`BROLL_MODE`/n8n `broll_mode` (default quantity). Quality stops before images/render with tracker status `needs_broll` (no new CSV column), `processed/<job>/envato-needed.md` and `broll-inbox/<job-id>/`; Quantity renders and lists optional clips. Clips dropped in the inbox are checked, copied to `broll-assets/inbox/`, approved as `E####` with `broll-assets/approval-log.jsonl` provenance, indexed via the service's new `/refresh`, and the job is re-planned. The n8n report shows a plain-English summary. 45 tests pass; isolated live `/refresh` check passed. Details: `docs/sessions/2026-10-07-claude-broll-phase3-5.md`.
- Isolated end-to-end test (diabetes sample, Claude standing in for the text AI, render stubbed): Quality stopped with an Envato list, inbox import/rejection/refresh/re-plan worked, Quantity re-used the plan and reached render. Found and fixed a fit-check phrase-boundary bug. **Open:** clips with non-descriptive file names (`c4`, `C0166`) score below the 0.18 keep floor even when they fit; user decision needed. Details: `docs/sessions/2026-10-07-claude-broll-e2e-test.md`.
- Not verified: real planner LLM call (incl. `missing_beats`), render, n8n run. After merge restart `Start-Vector-Retrieval.cmd` (needed for `/verify` and `/refresh`; without it Quality mode fails clearly).
- Indexes (ignored): project 56/56 at 1 fps; E: `Envato Stocks` 246/247 (`envato-1fps.sqlite`); Panchakarma stopped at 326/1305 because the E: drive dropped out (USB reset 16:11, 7 Oct); 22 files there are genuinely damaged. Do not resume or scan E: until the user has checked/backed up the drive. Indexed ≠ approved.

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
