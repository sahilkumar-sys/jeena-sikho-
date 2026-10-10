<#
.SYNOPSIS
Moves finished Envato downloads into a job's B-roll inbox and labels each with its moment.

.DESCRIPTION
Started by Open-Envato-Links.cmd (written into broll-inbox/<job-id>/ when Quality mode stops).
You search and download in your own browser while logged in to Envato Elements; Envato's Fair Use
Policy forbids scripted downloading, so this script never downloads anything. It only watches your
Downloads folder for new video files, waits until each download has finished, and moves it into the
inbox as "<moment>-<search>--<original name>" so the factory knows which moment it is for.
Close the window when you are done. Putting a clip in the inbox means you approve it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Inbox,
    [string]$Downloads = '',
    [double]$Minutes = 180,
    [int]$PollSeconds = 2,
    [switch]$Once,
    [datetime]$Since = [datetime]::MinValue
)

$ErrorActionPreference = 'Stop'
$videoExtensions = @('.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi')
$stopWords = @('the', 'and', 'with', 'for', 'from', 'into', 'stock', 'video', 'footage', 'clip', 'shot', 'close', 'view', 'utc', 'mp4', 'mov')
$inboxPath = (Resolve-Path -LiteralPath $Inbox).Path.TrimEnd('\', '.')
if (-not $Downloads) {
    try { $Downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path } catch { $Downloads = '' }
    if (-not $Downloads) { $Downloads = Join-Path $env:USERPROFILE 'Downloads' }
}
if (-not (Test-Path -LiteralPath $Downloads -PathType Container)) { throw "Downloads folder not found: $Downloads" }
if ($Since -eq [datetime]::MinValue) { $Since = (Get-Date).AddSeconds(-10) }

$moments = @()
$momentsFile = Join-Path $inboxPath 'envato-moments.json'
if (Test-Path -LiteralPath $momentsFile) {
    # Parentheses keep a JSON array as an array in Windows PowerShell 5.1.
    $moments = @((Get-Content -LiteralPath $momentsFile -Raw -Encoding UTF8 | ConvertFrom-Json))
}
$logFile = Join-Path $inboxPath 'collector-log.txt'

function Get-Words([string]$text) {
    return @($text.ToLowerInvariant() -split '[^a-z0-9]+' | Where-Object { $_.Length -ge 3 -and $stopWords -notcontains $_ -and $_ -notmatch '^\d+$' })
}

# The moment whose words best match the file name; none when nothing or a tie matches.
function Find-Moment([string]$fileName) {
    $words = Get-Words ([IO.Path]::GetFileNameWithoutExtension($fileName))
    $best = $null; $bestScore = 0; $secondScore = 0
    foreach ($moment in $moments) {
        $score = @($moment.words | Where-Object { $words -contains $_ }).Count
        if ($score -gt $bestScore) { $secondScore = $bestScore; $bestScore = $score; $best = $moment }
        elseif ($score -gt $secondScore) { $secondScore = $score }
    }
    if ($bestScore -ge 1 -and $bestScore -gt $secondScore) { return $best }
    return $null
}

function Get-FreePath([string]$directory, [string]$name) {
    $extension = [IO.Path]::GetExtension($name)
    $base = [IO.Path]::GetFileNameWithoutExtension($name)
    if ($base.Length -gt 140) { $base = $base.Substring(0, 140) }
    $candidate = Join-Path $directory ($base + $extension)
    $number = 2
    while (Test-Path -LiteralPath $candidate) { $candidate = Join-Path $directory ('{0}-{1}{2}' -f $base, $number, $extension); $number += 1 }
    return $candidate
}

function Test-Unlocked([string]$path) {
    try { $stream = [IO.File]::Open($path, 'Open', 'Read', 'None'); $stream.Close(); return $true } catch { return $false }
}

function Add-ToInbox([string]$path, [string]$originalName) {
    $moment = Find-Moment $originalName
    $name = if ($moment) { '{0}-{1}--{2}' -f $moment.n, $moment.slug, $originalName } else { $originalName }
    $target = Get-FreePath $inboxPath $name
    Move-Item -LiteralPath $path -Destination $target
    $label = if ($moment) { "moment $($moment.n) ($($moment.english))" } else { 'no matching moment (kept its Envato name)' }
    Add-Content -LiteralPath $logFile -Value ("{0}`t{1}`t{2}" -f (Get-Date -Format s), $originalName, [IO.Path]::GetFileName($target)) -Encoding UTF8
    Write-Host ("  + {0} -> {1}" -f $originalName, $label) -ForegroundColor Green
    if ($moment) { $script:covered[[string]$moment.n] = $true }
}

$script:covered = @{}
$seenSizes = @{}
$handled = @{}
try { $Host.UI.RawUI.WindowTitle = 'Envato download collector' } catch { }
Write-Host "Envato download collector" -ForegroundColor Cyan
Write-Host "Watching: $Downloads"
Write-Host "Inbox:    $inboxPath"
if ($moments.Count) { Write-Host ("Moments:  {0}" -f (($moments | ForEach-Object { "$($_.n) $($_.english)" }) -join ' | ')) }
Write-Host "Download clips in your browser (logged in to Envato Elements). Close this window when you are done.`n"

$deadline = (Get-Date).AddMinutes($Minutes)
do {
    $files = @(Get-ChildItem -LiteralPath $Downloads -File -ErrorAction SilentlyContinue | Where-Object {
        $_.LastWriteTime -ge $Since -and -not $handled.ContainsKey($_.FullName) -and
        ($videoExtensions -contains $_.Extension.ToLowerInvariant() -or $_.Extension -ieq '.zip') })
    foreach ($file in $files) {
        # A download is finished when its size is stable between two checks and no program holds it open.
        $ready = $Once -or ($seenSizes.ContainsKey($file.FullName) -and $seenSizes[$file.FullName] -eq $file.Length -and $file.Length -gt 0)
        $seenSizes[$file.FullName] = $file.Length
        if (-not $ready -or -not (Test-Unlocked $file.FullName)) { continue }
        $handled[$file.FullName] = $true
        if ($file.Extension -ieq '.zip') {
            $unzip = Join-Path $inboxPath ('_unzip-' + [guid]::NewGuid().ToString('N'))
            try {
                Expand-Archive -LiteralPath $file.FullName -DestinationPath $unzip
                foreach ($inner in @(Get-ChildItem -LiteralPath $unzip -File -Recurse | Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() })) {
                    Add-ToInbox $inner.FullName $inner.Name
                }
            } catch { Write-Host "  ! Could not unzip $($file.Name): $($_.Exception.Message)" -ForegroundColor Yellow }
            finally { if (Test-Path -LiteralPath $unzip) { Remove-Item -LiteralPath $unzip -Recurse -Force } }
            continue
        }
        try { Add-ToInbox $file.FullName $file.Name } catch { Write-Host "  ! Could not move $($file.Name): $($_.Exception.Message)" -ForegroundColor Yellow }
    }
    if ($moments.Count -and $script:covered.Count -ge $moments.Count) {
        Write-Host "`nAll $($moments.Count) moments have a clip. Run the factory again (or let n8n run). You can close this window." -ForegroundColor Cyan
        $moments = @()  # keep collecting extra clips quietly
    }
    if ($Once) { break }
    Start-Sleep -Seconds $PollSeconds
} while ((Get-Date) -lt $deadline)
