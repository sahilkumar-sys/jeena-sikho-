# Production v7 — video-first promotion, 5 October 2026

This snapshot is the source promoted to `C:\Users\js19187\Desktop\heygen workflow`. It includes the planner, renderer, approved ID list, usage ledger module, Windows vector service/client, four-frame local index and its incremental refresh launcher and handoff Markdown. It contains no API keys or private `.env`.

The live n8n workflow is bind-mounted to this source. No workflow JSON change or reimport is required. The n8n schedule was not activated. Docker Desktop was down at promotion, so no v7 end-to-end n8n/provider run is claimed. The separate publisher and existing completed videos were untouched.

## Restore the exact pre-v7 code and context

Stop or let a factory job finish first. From PowerShell:

```powershell
$projectRoot = 'C:\Users\js19187\Desktop\heygen workflow'
$saved = Join-Path $projectRoot 'versions\pre-video-first-2026-10-05'
@('video-broll-factory.js','local-media-catalog.js','speech-duration-planner.js','render-mixed-broll.js','video-broll-factory-README.md','PROJECT.md','Future Vector Embedding Update.md') |
  ForEach-Object { Copy-Item -LiteralPath (Join-Path $saved $_) -Destination (Join-Path $projectRoot $_) -Force }
@('Current State.md','Visual and Asset Rules.md','Start Here.md','Files and Commands.md') |
  ForEach-Object { Copy-Item -LiteralPath (Join-Path $saved 'Knowledge' $_) -Destination (Join-Path $projectRoot 'Knowledge' $_) -Force }
```

The new helper files may remain in the folder after rollback; v6 code does not import them. Existing `processed/broll-usage-ledger.json`, if created later by v7, is historical data and need not be deleted. To reapply v7, copy the files from this version directory back to the same relative paths. Do not copy an old `.env` over current secrets.

## Verification and limits

- Node syntax checks passed for all changed JS modules. Python syntax passed for the vector service.
- The dynamic plan accepted two distinct Akshi sample clips with 4.04s/2.68s speech-led durations and rejected a repeated B002 asset.
- The Windows local vector service loaded 19 approved indexed clips and returned B002 first for a laptop-eye-strain English query and B003 first for a close-up-eye query. The Node client health and search calls passed.
- The side beta had previously rendered a distinct-asset Akshi reel at 1080×1920 H.264/AAC and rejected its previous manifest with repeated visuals. That render used the same uniqueness renderer logic copied into v7.
- Windows Docker engine was not available; container-to-host retrieval, the extra LLM query translation, new Gemini image fallback and a complete v7 render still need an isolated manual end-to-end test.
- E: Envato footage is not mounted or approved in this version; its source drive has had intermittent I/O errors. The SQLite snapshot contains only the readable project gallery. The 80% editorial fit concept has not been calibrated.
