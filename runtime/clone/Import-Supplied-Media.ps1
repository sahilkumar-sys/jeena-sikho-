param(
    [Parameter(Mandatory = $true)][string]$MediaRoot,
    [Parameter(Mandatory = $true)][string]$DestinationRoot,
    [string]$BrollFolder,
    [switch]$ApproveSuppliedBroll
)

$ErrorActionPreference = 'Stop'
$mediaRootPath = (Resolve-Path -LiteralPath $MediaRoot -ErrorAction Stop).Path
$destinationRootPath = [IO.Path]::GetFullPath($DestinationRoot)
if (-not (Test-Path -LiteralPath $destinationRootPath -PathType Container)) {
    throw "Project directory is missing: $destinationRootPath"
}
$videoExtensions = @('.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v')
$imageExtensions = @('.png', '.jpg', '.jpeg', '.webp')
$copied = 0

function Copy-MediaFile([string]$source, [string]$destination) {
    if (Test-Path -LiteralPath $destination -PathType Leaf) {
        $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
        $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
        if ($sourceHash -ne $destinationHash) {
            throw "Media name conflict; existing file was not replaced: $destination"
        }
        return
    }
    $parent = Split-Path -Path $destination -Parent
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -ErrorAction Stop
    $script:copied += 1
}

function Copy-MediaFolder([string]$sourceFolder, [string]$destinationFolder, [string[]]$extensions, [bool]$flatten) {
    if (-not (Test-Path -LiteralPath $sourceFolder -PathType Container)) { return }
    $sourcePath = (Resolve-Path -LiteralPath $sourceFolder).Path.TrimEnd('\', '/')
    Get-ChildItem -LiteralPath $sourcePath -File -Recurse | Where-Object {
        $extensions -contains $_.Extension.ToLowerInvariant() -and
        -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
    } | ForEach-Object {
        $relative = if ($flatten) { $_.Name } else { $_.FullName.Substring($sourcePath.Length).TrimStart('\', '/') }
        Copy-MediaFile $_.FullName (Join-Path $destinationFolder $relative)
    }
}

$incomingSource = Join-Path $mediaRootPath 'incoming'
$incomingDestination = Join-Path $destinationRootPath 'incoming'
if (Test-Path -LiteralPath $incomingSource -PathType Container) {
    Copy-MediaFolder $incomingSource $incomingDestination $videoExtensions $false
} else {
    Get-ChildItem -LiteralPath $mediaRootPath -File | Where-Object {
        $videoExtensions -contains $_.Extension.ToLowerInvariant()
    } | ForEach-Object { Copy-MediaFile $_.FullName (Join-Path $incomingDestination $_.Name) }
}

$brollSource = if ($BrollFolder) { (Resolve-Path -LiteralPath $BrollFolder -ErrorAction Stop).Path } else { Join-Path $mediaRootPath 'broll-assets' }
$brollDestination = Join-Path $destinationRootPath 'broll-assets'
Copy-MediaFolder $brollSource $brollDestination $videoExtensions $false
Copy-MediaFolder (Join-Path $mediaRootPath 'product-assets\images') (Join-Path $destinationRootPath 'product-assets\images') $imageExtensions $false
Copy-MediaFolder (Join-Path $mediaRootPath 'product-assets\hires') (Join-Path $destinationRootPath 'product-assets\hires') $imageExtensions $false
Copy-MediaFolder (Join-Path $mediaRootPath 'reference-assets') (Join-Path $destinationRootPath 'reference-assets') $imageExtensions $false

$soundSource = Join-Path $mediaRootPath 'woosh-sound-effect.mp3'
if (Test-Path -LiteralPath $soundSource -PathType Leaf) {
    Copy-MediaFile $soundSource (Join-Path $destinationRootPath 'woosh-sound-effect.mp3')
}

$baseMapPath = Join-Path $brollDestination 'asset-map.json'
if (-not (Test-Path -LiteralPath $baseMapPath -PathType Leaf)) { throw "Tracked B-roll catalog is missing: $baseMapPath" }
$baseMap = Get-Content -LiteralPath $baseMapPath -Raw | ConvertFrom-Json
$knownNames = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $baseMap.assets.PSObject.Properties) { [void]$knownNames.Add(([string]$entry.Value).Replace('\', '/')) }

$localMapPath = Join-Path $brollDestination 'local-asset-map.json'
$localAssets = [ordered]@{}
if (Test-Path -LiteralPath $localMapPath -PathType Leaf) {
    $saved = Get-Content -LiteralPath $localMapPath -Raw | ConvertFrom-Json
    foreach ($entry in $saved.assets.PSObject.Properties) {
        $localAssets[$entry.Name] = [string]$entry.Value
        [void]$knownNames.Add(([string]$entry.Value).Replace('\', '/'))
    }
}
$nextId = 1
foreach ($id in $localAssets.Keys) {
    if ($id -match '^U(\d+)$') { $nextId = [Math]::Max($nextId, [int]$Matches[1] + 1) }
}
Get-ChildItem -LiteralPath $brollDestination -File -Recurse | Where-Object {
    $videoExtensions -contains $_.Extension.ToLowerInvariant()
} | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($brollDestination.Length).TrimStart('\', '/').Replace('\', '/')
    if (-not $knownNames.Contains($relative)) {
        $id = 'U{0:D4}' -f $nextId
        $nextId += 1
        $localAssets[$id] = $relative
        [void]$knownNames.Add($relative)
    }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($localMapPath, (ConvertTo-Json -InputObject @{ assets = $localAssets } -Depth 5), $utf8)

$localApprovedPath = Join-Path $destinationRootPath 'local-approved-stock-ids.json'
$approved = @()
if (Test-Path -LiteralPath $localApprovedPath -PathType Leaf) {
    $approved = @(Get-Content -LiteralPath $localApprovedPath -Raw | ConvertFrom-Json)
}
if ($ApproveSuppliedBroll) { $approved = @($approved + @($localAssets.Keys) | Sort-Object -Unique) }
[IO.File]::WriteAllText($localApprovedPath, (ConvertTo-Json -InputObject @($approved) -Depth 4), $utf8)

Write-Host "Media import complete: $copied new files; $($localAssets.Count) local B-roll IDs; $($approved.Count) locally approved IDs. Existing files were preserved."
