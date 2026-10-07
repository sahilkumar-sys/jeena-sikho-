$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$required = @(
    'video-broll-factory.js',
    'video-broll-factory-workflow.json',
    'approved-stock-ids.json',
    'vector-index\local-clips.sqlite',
    'runtime\vector-cache\models',
    'runtime\vector-cache\venv\Scripts\python.exe',
    'runtime\n8n\docker-compose.yml',
    'runtime\n8n\Dockerfile',
    'runtime\n8n\.env'
)
$missing = $required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot $_)) }
if ($missing) { throw ('Portable files are missing: ' + ($missing -join ', ')) }

& (Join-Path $projectRoot 'runtime\Repair-Portable-Python.ps1')
$python = Join-Path $projectRoot 'runtime\vector-cache\venv\Scripts\python.exe'
& $python -c 'from pathlib import Path; import sqlite3; p=Path("vector-index/local-clips.sqlite"); db=sqlite3.connect(p); print("Indexed clips:", db.execute("select count(*) from clips where present=1 and status=''complete''").fetchone()[0]); db.close()'
if ($LASTEXITCODE -ne 0) { throw 'Vector index validation failed.' }

if (Get-Command node -ErrorAction SilentlyContinue) {
    node --check (Join-Path $projectRoot 'video-broll-factory.js')
    if ($LASTEXITCODE -ne 0) { throw 'Factory JavaScript syntax validation failed.' }
}
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose -f (Join-Path $projectRoot 'runtime\n8n\docker-compose.yml') config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose validation failed.' }
}
Write-Host 'Portable project validation passed.' -ForegroundColor Green
