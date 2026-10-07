$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'runtime'
$n8nRoot = Join-Path $runtimeRoot 'n8n'
$compose = Join-Path $n8nRoot 'docker-compose.yml'
$vectorRoot = Join-Path $runtimeRoot 'vector-cache'
$python = Join-Path $vectorRoot 'venv\Scripts\python.exe'
$service = Join-Path $projectRoot 'vector-retrieval-service.py'
$pidFile = Join-Path $runtimeRoot 'vector-service.pid'
$logFile = Join-Path $runtimeRoot 'vector-service.log'
$errorLog = Join-Path $runtimeRoot 'vector-service.err.log'

& (Join-Path $runtimeRoot 'Repair-Portable-Python.ps1')

$existing = $null
if (Test-Path -LiteralPath $pidFile) {
    $savedPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($savedPid -match '^\d+$') {
        $candidate = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
        if ($candidate -and $candidate.Path -eq $python) { $existing = $candidate }
    }
}
if (-not $existing) {
    $env:HF_HOME = Join-Path $vectorRoot 'models'
    $env:HF_HUB_OFFLINE = '1'
    $env:TRANSFORMERS_OFFLINE = '1'
    $env:PYTHONUTF8 = '1'
    $env:BROLL_VECTOR_BIND = '0.0.0.0'
    $quotedService = '"' + $service + '"'
    $process = Start-Process -FilePath $python -ArgumentList @($quotedService) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $errorLog
    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
}

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, then run Start-Heygen.cmd again.' }
docker compose -f $compose up -d
if ($LASTEXITCODE -ne 0) { throw 'n8n failed to start.' }

$vectorReady = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
        Invoke-RestMethod -Uri 'http://127.0.0.1:8766/health' -TimeoutSec 3 | Out-Null
        $vectorReady = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $vectorReady) { throw "Vector service did not become ready. Check $errorLog" }

Write-Host 'Heygen services are ready.' -ForegroundColor Green
Write-Host 'n8n: http://localhost:5678'
Write-Host 'Vector retrieval: http://127.0.0.1:8766/health'
