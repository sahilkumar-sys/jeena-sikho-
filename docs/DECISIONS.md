# Decisions

## 2026-10-07 — Source control boundary

- `main` contains the initial reviewed source baseline. Changes use `<agent-name>/<task>` branches and PR review before merge.
- Keep code, asset catalogs, and handoff documents in Git. Exclude credentials, live tracker data, rendered/source media, and bundled runtime dependencies. Those local files remain in the portable project copy; Git alone cannot reproduce a render.
- Keep the existing Node `node:test` suite as the dependency-free PR gate. No package manager was added.
- Preserve the existing v7.1 production code and inactive n8n schedule. Collaboration setup does not change provider behavior or approve publishing.

## 2026-10-07 — Fresh-clone bootstrap

- Keep the complete-folder portable setup for existing installations. Add a separate Windows clone bootstrap using Docker for n8n and CPU SigLIP2 retrieval, so host Python, Node, model, and vector DB need not be copied from the original machine.
- Accept only user-supplied, rights-confirmed B-roll into ignored local approval files. Never treat indexing alone as approval. Preserve existing media and private `.env` on repeat runs.
- Keep setup separate from execution. The imported n8n schedule and automatic processing remain off; publishing still requires per-video approval.
- The new private environment selects OpenAI text and, after explicit authorization, OpenAI Images API for unattended stills. Codex's in-chat image tool is available to an agent-led sample but cannot run as a scheduled script. The old portable Gemini settings are not modified.
