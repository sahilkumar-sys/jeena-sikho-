# n8n Docker Setup

Start n8n:

```powershell
docker compose up -d
```

Open n8n:

```text
http://localhost:5678
```

Stop n8n:

```powershell
docker compose down
```

Update n8n later:

```powershell
docker compose pull
docker compose up -d
```

Your n8n data is stored in the Docker volume `n8n-docker_n8n_data`.
