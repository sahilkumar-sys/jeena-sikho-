# Decisions

## 2026-10-07 — Source control boundary

- `main` contains the initial reviewed source baseline. Changes use `<agent-name>/<task>` branches and PR review before merge.
- Keep code, asset catalogs, and handoff documents in Git. Exclude credentials, live tracker data, rendered/source media, and bundled runtime dependencies. Those local files remain in the portable project copy; Git alone cannot reproduce a render.
- Keep the existing Node `node:test` suite as the dependency-free PR gate. No package manager was added.
- Preserve the existing v7.1 production code and inactive n8n schedule. Collaboration setup does not change provider behavior or approve publishing.
