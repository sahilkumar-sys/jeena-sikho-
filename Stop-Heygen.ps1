$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'runtime'
$n8nRoot = Join-Path $runtimeRoot 'n8n'
$compose = Join-Path $n8nRoot 'docker-compose.yml'
$python = Join-Path $runtimeRoot 'vector-cache\venv\Scripts\python.exe'
$pidFile = Join-Path $runtimeRoot 'vector-service.pid'

if (Test-Path -LiteralPath $pidFile) {
    $savedPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($savedPid -match '^\d+$') {
        $process = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
        if ($process -and $process.Path -eq $python) {
            Stop-Process -Id $process.Id
        }
    }
    Remove-Item -LiteralPath $pidFile -Force
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose -f $compose down
}
Write-Host 'Heygen services are stopped.' -ForegroundColor Green
