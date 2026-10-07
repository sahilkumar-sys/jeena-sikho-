# Starting from a GitHub clone

The GitHub repository is the source of truth for code, catalogs, rules, and handoffs. It does **not** contain the licensed/private media, model, Python environment, vector database, live queue, rendered output, n8n state, or credentials. A clone alone supports source work and tests, but not a full factory render.

## Code-only work from a clean clone

1. Install Node.js 24 and clone the repository. Check out the reviewed `main` branch, or the relevant task branch while its PR is open.
2. Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`, and the newest sections of `PROJECT.md` and `Future Vector Embedding Update.md`.
3. In the project root, run `node --test --test-isolation=none caption-grammar.test.js`, `node --check video-broll-factory.js`, and `node --check publishing/meta-publisher.js`. There is no `npm install` step or `package.json`.
4. Create a separate `<agent-name>/<task>` branch or worktree. Update handoff and roadmap docs before finishing.

## Full local runtime needs a controlled asset copy

Obtain the existing portable project assets from the project owner through a controlled transfer, keeping the paths below relative to the clone root. Do not download private media or credentials from an unverified source, and do not commit them.

| Required local path | Purpose |
| --- | --- |
| `runtime/vector-cache/python/`, `runtime/vector-cache/venv/`, `runtime/vector-cache/models/`, `runtime/tools/uv.exe` | Bundled Python 3.11, SigLIP2 model, environment, and rebuild tool expected by `runtime/Repair-Portable-Python.ps1`. |
| `vector-index/local-clips.sqlite` | Approved project-gallery vector index. |
| `broll-assets/` videos, `product-assets/images/` and `product-assets/hires/`, `reference-assets/` | Approved media and exact product/reference images; Git holds only catalogs. |
| `woosh-sound-effect.mp3` and an `incoming/` source video | Existing sound insert and input for a real render. |
| `runtime/n8n/.env` | Private n8n/provider settings. Use `runtime/n8n/.env.example` as a template and enter values locally; never commit or print them. |
| `video-control.csv` | Live queue. Restore the actual tracker from the controlled project copy if continuing existing work; do not replace it with the example while a run is active. |

`processed/` and `runtime/n8n/data/` are also needed to **resume** previous jobs and preserve the existing n8n instance. They are not required for code-only tests. The external Extended B-Roll Library and E: Envato gallery are separate and are not part of Git or the portable project bundle.

After the controlled files are present, install and start Docker Desktop with its Linux engine, then run `./Setup-Portable.ps1` and `./Start-Heygen.ps1` in PowerShell. `Setup-Portable.ps1` first calls `runtime/Repair-Portable-Python.ps1`, which requires the bundled Python and `uv.exe`; it does not download them from Git. `PORTABLE-SETUP.md` describes transfer and Docker startup for the **complete portable folder**, not a bare clone.

## Current production boundary

The v7.1 automated planner, image, and caption provider configuration still has Gemini paths. The user has instructed this project not to use Gemini services. Do not start a full provider-driven production run from a clone or portable copy until an explicitly non-Gemini path is built and verified. The n8n schedule stays inactive; publishing needs per-video approval.
