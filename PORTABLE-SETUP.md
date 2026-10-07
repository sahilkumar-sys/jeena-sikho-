# Portable Heygen workflow

This folder contains the production project, approved local media, completed
outputs, vector model/index, Python runtime, and n8n configuration. It can be
copied to a different folder, Windows user, or drive without editing paths.

## New-computer setup

1. Copy the **entire** `heygen workflow` folder. Do not copy only the scripts.
2. Install current NVIDIA drivers if CUDA acceleration is wanted. CPU fallback
   works but vector startup and searches are slower.
3. Install and start Docker Desktop with its Linux/WSL 2 engine.
4. Keep `runtime/n8n/.env` private. It contains service credentials and the n8n
   encryption key. If the file is intentionally excluded from a transfer, copy
   `.env.example` to `.env` and fill the values locally.
5. Double-click `Setup-Portable.cmd` once. It repairs the moved Python environment,
   builds the pinned n8n + FFmpeg image, starts n8n, and imports the workflow.
6. For normal use, double-click `Start-Heygen.cmd`. Open
   `http://localhost:5678`. Use `Stop-Heygen.cmd` when finished.

The imported schedule stays inactive. Run and review one manual video before
enabling automation. Publishing still requires explicit per-video approval.
If the bundled Python environment cannot be repaired after a move, setup uses the
included `uv.exe` to rebuild it from pinned requirements; that fallback requires
internet access and downloads the CUDA-enabled PyTorch packages again.

If Docker Desktop reports an inaccessible `sailor-ingest.sock`, quit Docker and
repair/reinstall Docker Desktop before running setup. Do not use “Reset to factory
defaults” unless Docker volumes have been backed up and their loss is acceptable.

## Included and excluded data

- Included: approved `broll-assets`, product/reference images, incoming and
  processed data, the SigLIP2 model, local project index, Python/CUDA packages,
  n8n Compose files, and the workflow JSON.
- Not included: the separate `E:\Envato Stocks` experimental gallery (about
  205.8 GiB). It is not needed for the approved project gallery or normal runs.
- Historical absolute paths inside old manifests and dated documentation are
  provenance records. Live launchers and code use project-relative paths.

## Security

Treat `runtime/n8n/.env` and `runtime/n8n/data/` as private. Transfer them only
to a computer you control. Never upload the full folder to a public repository or
file-sharing link without first removing secrets and private source/output media.
