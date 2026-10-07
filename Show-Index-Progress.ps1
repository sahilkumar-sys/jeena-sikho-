# Live progress counter for B-roll vector indexing. Read-only: it only reads
# runtime\vector-cache\logs\progress-*.json written by vector-index\index_clips.py.
param([int]$RefreshSeconds = 3, [switch]$Once, [string]$ProjectRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$logs = Join-Path $ProjectRoot 'runtime\vector-cache\logs'

function Show-Bar([double]$percent) {
  $width = 30
  $filled = [math]::Min($width, [math]::Max(0, [int]($percent / 100 * $width)))
  return ('#' * $filled) + ('-' * ($width - $filled))
}

do {
  $files = @(Get-ChildItem -Path $logs -Filter 'progress-*.json' -ErrorAction SilentlyContinue)
  if (-not $Once) { Clear-Host }
  Write-Host "B-roll indexing progress  ($(Get-Date -Format 'HH:mm:ss'))" -ForegroundColor Cyan
  if (-not $files.Count) { Write-Host "No indexing run has written progress yet ($logs)." }
  $running = $false
  foreach ($file in $files) {
    try { $p = Get-Content -Raw -Encoding UTF8 $file.FullName | ConvertFrom-Json } catch { continue }
    $eta = if ($null -ne $p.eta_seconds) { '{0}m {1:00}s' -f [int][math]::Floor($p.eta_seconds / 60), [int]($p.eta_seconds % 60) } else { '-' }
    Write-Host ''
    Write-Host ("{0}: {1}" -f $p.label, $p.state)
    Write-Host ("  [{0}] {1}%  {2}/{3} clips  errors {4}  ETA {5}" -f (Show-Bar $p.percent), $p.percent, $p.done, $p.total, $p.errors, $eta)
    if ($p.chunk) { Write-Host ("  chunk {0}" -f $p.chunk) }
    if ($p.current) { Write-Host ("  now: {0}" -f $p.current) }
    Write-Host ("  updated {0}" -f $p.updated_at)
    if ($p.state -notin @('finished', 'complete')) { $running = $true }
  }
  if ($Once -or -not $running) { break }
  Start-Sleep -Seconds $RefreshSeconds
} while ($true)
