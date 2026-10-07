# Supplied-video factory

This project edits an existing presenter video: it transcribes speech with ElevenLabs, plans matching B-roll, adds captions, and renders a vertical MP4. It does not create the presenter performance. The separate `publishing/` flow needs per-video approval.

## New GitHub clone

On Windows, supply your media folder and API keys, then run:

```powershell
./Bootstrap-From-Git.ps1 -MediaRoot 'C:\path\to\your\media'
```

Put source videos in `incoming/` within that folder; optionally add licensed clips in `broll-assets/` and photos matching the existing product/reference catalogs. The script imports them without replacing existing files, prepares a private non-Gemini environment, sets up Docker and local retrieval, and imports the inactive n8n workflow. You must explicitly approve using the OpenAI Images API for unattended stills; Codex's in-chat image tool cannot run inside a scheduled script. Docker Desktop may require first-run system setup. See [clone setup](docs/CLONE-SETUP.md) for details and verification limits.

After setup, review the media and workflow at `http://127.0.0.1:5678` before running a first video. The schedule stays inactive, and rendering does not post to social media. The existing complete-folder setup path remains in `PORTABLE-SETUP.md`.

## Tests and collaboration

Code-only tests need Node.js 24, with no package install:

```powershell
node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js
./runtime/clone/Test-Bootstrap.ps1
```

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/HANDOFF.md` first. Work on a branch such as `codex/caption-fix`; concurrent agents use separate worktrees, for example `git worktree add ../caption-fix -b codex/caption-fix main`. Update `docs/HANDOFF.md` and `docs/ROADMAP.md`, open a PR, and review before merging to `main`. Git tracks code and shared context; private keys, licensed media, live queue and output stay local.
