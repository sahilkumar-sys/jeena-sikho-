# Start from a GitHub clone

Git is the source of truth for code, rules, tracked catalogs, and handoffs. Private credentials, licensed media, the live queue, vector model/index, and renders are ignored. A new machine supplies its own keys and media; the bootstrap creates the local runtime state.

## Windows setup

1. Clone the repository and check out reviewed `main` (or the task branch while its PR is open). Read `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/HANDOFF.md` before editing.
2. Put presenter videos in a folder named `incoming` under your media folder. Optionally put licensed video clips in `broll-assets`, product photos matching filenames in the tracked `product-assets/catalog.json` in `product-assets/images` or `product-assets/hires`, and the named reference photos in `reference-assets`. A media folder containing only presenter videos at its top level also works. Keep any media you do not have rights to use out of the supplied B-roll folder.
3. Open PowerShell in the clone and run `./Bootstrap-From-Git.ps1 -MediaRoot 'C:\path\to\your\media'`. The script asks you to confirm rights for supplied B-roll, confirm whether to use the OpenAI Images API for unattended stills, and enter ElevenLabs and OpenAI API keys through hidden prompts. You can set `ELEVENLABS_API_KEY` and `OPENAI_API_KEY` in the current process instead. Do not put keys on the command line, in Git, or in chat.
4. The bootstrap installs or starts Docker Desktop if needed, builds the n8n and optional CPU vector containers, downloads the public SigLIP2 model when approved clips are present, indexes those clips, imports the inactive n8n workflow, and runs local checks. Docker Desktop's first launch may still require its own terms, WSL setup, or reboot; rerun the same command afterward. It preserves existing media and private settings and reports filename conflicts instead of overwriting them.

`./Bootstrap-From-Git.ps1 -Plan` shows the steps without making changes. `-PrepareOnly` prepares media, tracker, and private settings without Docker. `-BrollFolder 'C:\other\licensed\clips'` accepts a separate video folder. `-ApproveSuppliedBroll` skips the rights confirmation only when you have already verified those rights. `-UseOpenAIImages` skips the image-provider confirmation only when you have explicitly authorized OpenAI Images API use. An unattended script cannot call Codex's in-chat image tool.

The new private `runtime/n8n/.env` selects ElevenLabs transcription, OpenAI text planning/caption correction, and, **only after the explicit image-provider confirmation**, OpenAI Images API still generation. It does not select Gemini. An existing `.env` is never replaced; bootstrap refuses one with a different provider configuration or missing keys. Keep it private. Its API calls have usage costs when a video is run.

The schedule stays inactive and `AUTO_PROCESS_NEW_VIDEOS=false`. Setup does **not** render or publish. Open `http://127.0.0.1:5678` after setup and review the workflow, supplied media, rights, and first video before a manual run. If a Codex agent is doing the project work, ask it to review the first plan and render; publication is a separate per-video approval.

## Tests and collaboration

For source-only work, install Node.js 24 and run `node --test --test-isolation=none caption-grammar.test.js local-media-catalog.test.js`. Run `./runtime/clone/Test-Bootstrap.ps1` in PowerShell to check the importer and bootstrap without Docker or real keys. PR CI runs both. No npm install is required.

Each agent uses a unique `<agent-name>/<task>` branch, ideally in its own worktree (`git worktree add ../my-task -b codex/my-task main`). Update handoff and roadmap docs, open a PR, and review before merging to `main`. Local media approvals (`local-approved-stock-ids.json` and `broll-assets/local-asset-map.json`) remain private to the machine; another clone must import and approve its own supplied clips.

The original complete-folder `Setup-Portable.ps1` path still supports an existing portable copy. It expects the previously bundled Python runtime and model; use `Bootstrap-From-Git.ps1` for a GitHub clone. Current B-roll automation searches the approved project gallery and exact catalogued product/reference assets. Extended/E: gallery search, Envato acquisition, and general existing-still search are still open work; do not claim the bootstrap implements that editorial sequence.
