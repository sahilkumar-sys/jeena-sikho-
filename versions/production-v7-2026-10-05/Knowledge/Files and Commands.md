---
tags: [paths, operations]
---

# Files and Commands

## Live project

| Purpose | Location |
| --- | --- |
| Vault and project root | `C:\Users\js19187\Desktop\heygen workflow` |
| Full handoff | [[PROJECT]] |
| n8n Compose and private `.env` | `C:\Users\js19187\Documents\Codex\2026-09-22\i-x20-2\outputs\n8n-docker` |
| n8n editor | `http://localhost:5678` |
| Input | `incoming/` |
| Job state | `video-control.csv` |
| Output and manifests | `processed/<video-and-job-id>/` |
| Product image catalog | `product-assets/catalog.json` and `product-assets/images/` |
| Publisher queue | `publishing/queue/` |
| Publisher ledger | `publishing/posting-ledger.csv` |

## Code and references

| Purpose | File |
| --- | --- |
| Factory runner | `video-broll-factory.js` |
| n8n factory export | `video-broll-factory-workflow.json` |
| Media catalog | `local-media-catalog.js` |
| Shot timing | `speech-duration-planner.js` |
| Mixed renderer | `render-mixed-broll.js` |
| Approved stock-video IDs | `approved-stock-ids.json` |
| Four-frame local index and incremental indexer | `vector-index/local-clips.sqlite`, `vector-index/index_clips.py` |
| Refresh the local index | Double-click `Refresh-Vector-Index.cmd`, then restart the retrieval service |
| Start local vector shortlist service | Double-click `Start-Vector-Retrieval.cmd` on Windows |
| Vector service/client | `vector-retrieval-service.py`, `vector-retrieval-client.js` |
| Cross-reel soft-use history | `processed/broll-usage-ledger.json` after first v7 completion; code in `broll-usage-ledger.js` |
| Exact pre-v7 rollback | `versions/pre-video-first-2026-10-05/` |
| Promoted v7 snapshot | `versions/production-v7-2026-10-05/` |
| Publisher instructions | `publishing/README.md` |
| Publisher runner | `publishing/meta-publisher.js` |
| Factory setup detail | `video-broll-factory-README.md` |

The full path map and exact fallback Docker command are in [[PROJECT#Where things live|locations]] and [[PROJECT#Main factory|factory instructions]]. The portable exports and their limitations are in [[PROJECT#Transfer and next-chat instructions|transfer instructions]].

## Maintenance

Update [[PROJECT]] when the project changes, then revise any affected summary note. These summaries have no automatic sync. Keep credentials in the private environment file only; do not add them to this vault.
