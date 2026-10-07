$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'runtime'
$n8nRoot = Join-Path $runtimeRoot 'n8n'
$compose = Join-Path $n8nRoot 'docker-compose.yml'
$envFile = Join-Path $n8nRoot '.env'
$envExample = Join-Path $n8nRoot '.env.example'

& (Join-Path $runtimeRoot 'Repair-Portable-Python.ps1')

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    throw "Created $envFile. Add your private API values, then run setup again."
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $settings[$matches[1]] = $matches[2]
    }
}
$required = @('GENERIC_TIMEZONE', 'TZ', 'N8N_ENCRYPTION_KEY', 'ELEVENLABS_API_KEY', 'LLM_PROVIDER', 'IMAGE_PROVIDER')
if ($settings['LLM_PROVIDER'] -eq 'gemini' -or $settings['IMAGE_PROVIDER'] -eq 'gemini') {
    $required += 'GEMINI_API_KEY'
}
$missing = $required | Where-Object { -not $settings.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($settings[$_]) }
if ($missing) {
    throw ('Required private settings are missing: ' + ($missing -join ', '))
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is required. Install and start it, then rerun setup.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is installed but its Linux engine is not running.'
}

New-Item -ItemType Directory -Force -Path (Join-Path $n8nRoot 'data') | Out-Null
docker compose -f $compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose validation failed.' }
docker compose -f $compose build
if ($LASTEXITCODE -ne 0) { throw 'The portable n8n image build failed.' }
docker compose -f $compose up -d
if ($LASTEXITCODE -ne 0) { throw 'n8n failed to start.' }

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5678/healthz' -TimeoutSec 3 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) { throw 'n8n did not become healthy within two minutes.' }

$importMarker = Join-Path $n8nRoot 'data\.heygen-workflow-imported'
if (-not (Test-Path -LiteralPath $importMarker)) {
    docker compose -f $compose exec -T n8n n8n import:workflow --input=/files/heygen-workflow/video-broll-factory-workflow.json
    if ($LASTEXITCODE -ne 0) { throw 'n8n started, but workflow import failed.' }
    New-Item -ItemType File -Force -Path $importMarker | Out-Null
}

Write-Host 'Portable setup is ready. Run Start-Heygen.cmd for normal startup.' -ForegroundColor Green
Write-Host 'The imported workflow schedule remains inactive.'
