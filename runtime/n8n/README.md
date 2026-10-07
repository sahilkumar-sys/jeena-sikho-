# Portable n8n runtime

This directory travels with the Heygen project. `docker-compose.yml` bind-mounts
the project root at `/files/heygen-workflow` and stores n8n state in `data/`.

Use the root-level `Setup-Portable.cmd`, `Start-Heygen.cmd`, and
`Stop-Heygen.cmd` wrappers. Keep `.env` private: it contains API credentials and
the n8n encryption key. `.env.example` is safe to copy and fill on a new trusted
machine.
