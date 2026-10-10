# Smoke test for Collect-Envato-Downloads.ps1 (Windows PowerShell 5.1 and PowerShell 7).
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('envato-collector-' + [guid]::NewGuid().ToString('N'))
$downloads = Join-Path $root 'Downloads'
$inbox = Join-Path $root 'broll-inbox\video-abc'
New-Item -ItemType Directory -Path $downloads, $inbox -Force | Out-Null
try {
    $moments = @(
        @{ n = 1; slug = 'insulin-pen'; english = 'hands preparing an insulin pen'; words = @('hands', 'preparing', 'insulin', 'pen', 'injection') },
        @{ n = 2; slug = 'donuts-sweets'; english = 'hand reaching for donuts'; words = @('hand', 'reaching', 'donuts', 'sweets', 'sugary') }
    )
    [IO.File]::WriteAllText((Join-Path $inbox 'envato-moments.json'), (ConvertTo-Json -InputObject $moments -Depth 4))
    [IO.File]::WriteAllText((Join-Path $downloads 'woman-hands-close-up-with-insulin-pen-4X4CT6P.mp4'), 'clip one')
    [IO.File]::WriteAllText((Join-Path $downloads 'chocolate-donuts-on-a-plate-QW12ER3.mov'), 'clip two')
    [IO.File]::WriteAllText((Join-Path $downloads 'sunset-over-city-ZZ99YY8.mp4'), 'clip three')
    [IO.File]::WriteAllText((Join-Path $downloads 'invoice.pdf'), 'not a video')
    $old = Join-Path $downloads 'old-insulin-pen-video.mp4'
    [IO.File]::WriteAllText($old, 'downloaded long before')
    (Get-Item -LiteralPath $old).LastWriteTime = (Get-Date).AddDays(-2)

    & (Join-Path $PSScriptRoot 'Collect-Envato-Downloads.ps1') -Inbox ($inbox + '\.') -Downloads $downloads -Once -Since (Get-Date).AddHours(-1) | Out-Null

    $inInbox = @(Get-ChildItem -LiteralPath $inbox -File | ForEach-Object { $_.Name })
    $expected = @('1-insulin-pen--woman-hands-close-up-with-insulin-pen-4X4CT6P.mp4', '2-donuts-sweets--chocolate-donuts-on-a-plate-QW12ER3.mov', 'sunset-over-city-ZZ99YY8.mp4')
    foreach ($name in $expected) { if ($inInbox -notcontains $name) { throw "Collector did not produce $name (inbox: $($inInbox -join ', '))" } }
    foreach ($name in @('invoice.pdf', 'old-insulin-pen-video.mp4')) { if (-not (Test-Path -LiteralPath (Join-Path $downloads $name))) { throw "Collector moved $name, which it must leave alone" } }
    if (@(Get-Content -LiteralPath (Join-Path $inbox 'collector-log.txt')).Count -ne 3) { throw 'Collector log should record three moves' }
    Write-Host 'Envato collector smoke test passed.'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
