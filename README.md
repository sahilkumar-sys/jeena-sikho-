# Supplied-video factory

**New GitHub clone:** You can inspect the source and run the Node tests immediately. A clone alone cannot run the video factory. Read [docs/CLONE-SETUP.md](docs/CLONE-SETUP.md) for the exact local assets, private settings, and runtime bundle needed before `Setup-Portable.ps1` can work. The automated provider path still uses Gemini and must not be run under the current no-Gemini instruction.

The agreed code fixes are implemented. Read `FACTORY-FIXES.md` for changes, verification and setup. `FACTORY-REVIEW-AND-SETUP.md` is the historical audit, with original Docker setup instructions.

Import the updated `video-broll-factory-workflow.json` into Docker n8n, supply provider credentials in its environment, and validate one video manually before activating the schedule.

Completed inputs go in `incoming`; selection/status are in `video-control.csv`; outputs and retry checkpoints go in `processed`. Retries reuse valid matching transcripts, plans and images.

Keep the new `factory-state.js` helper with the runner. The shared `assemble-test-video.js`, subtitle converter/style, Khand font and approved whoosh remain essential. Green-screen settings and the renderer are unchanged.

Linux kernel locks protect the batch. Their files remain on disk while idle; do not delete them. Edit CSV only when no execution is running. Older workflows, test assets and version backups are in `Non-Essential Testing Items`.

## Run and collaborate

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/HANDOFF.md` before editing. On Windows, install and start Docker Desktop, then run `./Setup-Portable.ps1` once and `./Start-Heygen.ps1` to start services. The setup uses local `runtime/n8n/.env` credentials. The current production provider path still includes Gemini, so do not start a full automated render until a non-Gemini path is verified. The n8n schedule remains inactive. See `PORTABLE-SETUP.md` for full setup details.

Run the dependency-free tests with `node --test --test-isolation=none caption-grammar.test.js`; check syntax with `node --check video-broll-factory.js` and `node --check publishing/meta-publisher.js`. These run on every pull request through GitHub Actions.

Create a branch such as `codex/caption-fix` for each task. For concurrent agents, create separate worktrees with `git worktree add ../caption-fix -b codex/caption-fix main` (choose a unique branch and path). Commit scoped changes, update `docs/HANDOFF.md` and `docs/ROADMAP.md`, open a pull request, and review it before merging to `main`. Do not push credentials, licensed/private media, source videos, generated renders, runtime data, or the live tracker. These stay in the controlled portable project copy; Git is the source of truth for code, catalogs, rules, and handoff notes.
