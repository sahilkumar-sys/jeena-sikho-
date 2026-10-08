# Supplied-video factory

This project edits an existing presenter video: it transcribes speech with ElevenLabs, plans matching B-roll, adds captions, and renders a vertical MP4. It does not create the presenter performance. The separate `publishing/` flow needs per-video approval.

## How a video is made

1. Put a presenter video in `incoming/`; it is added to `video-control.csv`.
2. The speech is transcribed and turned into short Hindi/English captions.
3. Each spoken phrase is matched against approved local B-roll clips by what the clips actually show (local AI search, no API cost).
4. A planner chooses the shots; a fit check confirms each clip's exact seconds match what is being said.
5. Choose the mode in n8n (`broll_mode`):
   - **Quantity** (default): always render — best real clip, at most 2 AI pictures, otherwise the presenter.
   - **Quality**: if an important moment has no good real clip, do not render. The job becomes `needs_broll` and `processed/<job>/envato-needed.md` lists what to download (time, spoken words, what to show, Envato search words).
6. Drop downloaded clips into `broll-inbox/<job-id>/` (this counts as your approval; keep Envato's descriptive file names). The next run checks, imports and indexes them, then plans the video again.
7. The final 1080×1920 MP4, a shot picture (`broll-contact-sheet.jpg`) and a review list (`broll-review.md`) are written to `processed/<job>/`.

Details: `docs/ARCHITECTURE.md`; rules for agents: `AGENTS.md`.

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
node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js broll-retrieval.test.js broll-fit-check.test.js broll-mode.test.js broll-inbox-import.test.js n8n-workflow.test.js
./runtime/clone/Test-Bootstrap.ps1
```

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/HANDOFF.md` first. Work on a branch such as `codex/caption-fix`; concurrent agents use separate worktrees, for example `git worktree add ../caption-fix -b codex/caption-fix main`. Update `docs/HANDOFF.md` and `docs/ROADMAP.md`, open a PR, and review before merging to `main`. Git tracks code and shared context; private keys, licensed media, live queue and output stay local.
