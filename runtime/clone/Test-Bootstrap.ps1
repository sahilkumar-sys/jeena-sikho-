$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$bootstrap = Join-Path $projectRoot 'Bootstrap-From-Git.ps1'
$importer = Join-Path $PSScriptRoot 'Import-Supplied-Media.ps1'

foreach ($file in @($bootstrap, $importer)) {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw "PowerShell parse failed: $file" }
}
& $bootstrap -Plan

$scratch = Join-Path $PSScriptRoot ('.smoke-' + [guid]::NewGuid().ToString('N'))
$media = Join-Path $scratch 'media'
$clone = Join-Path $scratch 'clone'
try {
    foreach ($directory in @('incoming', 'broll-assets', 'broll-assets\herbs', 'product-assets\images')) {
        New-Item -ItemType Directory -Path (Join-Path $media $directory) -Force | Out-Null
    }
    New-Item -ItemType Directory -Path (Join-Path $clone 'broll-assets') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $clone 'broll-assets\asset-map.json'), '{"assets":{}}')
    [IO.File]::WriteAllText((Join-Path $media 'incoming\presenter.mp4'), 'presenter fixture')
    [IO.File]::WriteAllText((Join-Path $media 'broll-assets\owned-herbs.mp4'), 'broll fixture')
    [IO.File]::WriteAllText((Join-Path $media 'broll-assets\herbs\owned-herbs.mp4'), 'nested broll fixture')
    [IO.File]::WriteAllText((Join-Path $media 'product-assets\images\product-001.png'), 'image fixture')

    & $importer -MediaRoot $media -DestinationRoot $clone -ApproveSuppliedBroll
    & $importer -MediaRoot $media -DestinationRoot $clone -ApproveSuppliedBroll
    $map = Get-Content -LiteralPath (Join-Path $clone 'broll-assets\local-asset-map.json') -Raw | ConvertFrom-Json
    $approved = @(Get-Content -LiteralPath (Join-Path $clone 'local-approved-stock-ids.json') -Raw | ConvertFrom-Json)
    $mapped = @($map.assets.PSObject.Properties | ForEach-Object { $_.Value })
    if ($mapped.Count -ne 2 -or $mapped -notcontains 'owned-herbs.mp4' -or
        $mapped -notcontains 'herbs/owned-herbs.mp4' -or $approved.Count -ne 2 -or
        $approved -notcontains 'U0001' -or $approved -notcontains 'U0002') { throw 'Local media approval/catalog failed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $clone 'incoming\presenter.mp4')) -or
        -not (Test-Path -LiteralPath (Join-Path $clone 'product-assets\images\product-001.png'))) { throw 'Media copy failed.' }

    [IO.File]::WriteAllText((Join-Path $media 'broll-assets\owned-herbs.mp4'), 'different bytes')
    $conflict = $false
    try { & $importer -MediaRoot $media -DestinationRoot $clone -ApproveSuppliedBroll } catch { $conflict = $_.Exception.Message -match 'Media name conflict' }
    if (-not $conflict -or (Get-Content -LiteralPath (Join-Path $clone 'broll-assets\owned-herbs.mp4') -Raw) -ne 'broll fixture') {
        throw 'Existing media was overwritten or the conflict was not reported.'
    }

    [IO.File]::WriteAllText((Join-Path $media 'broll-assets\owned-herbs.mp4'), 'broll fixture')
    New-Item -ItemType Directory -Path (Join-Path $clone 'runtime\clone'),(Join-Path $clone 'runtime\n8n') -Force | Out-Null
    Copy-Item -LiteralPath $bootstrap -Destination (Join-Path $clone 'Bootstrap-From-Git.ps1')
    Copy-Item -LiteralPath $importer -Destination (Join-Path $clone 'runtime\clone\Import-Supplied-Media.ps1')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\n8n\.env.example') -Destination (Join-Path $clone 'runtime\n8n\.env.example')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'video-control.example.csv') -Destination (Join-Path $clone 'video-control.example.csv')
    $priorElevenLabs = $env:ELEVENLABS_API_KEY
    $priorOpenAi = $env:OPENAI_API_KEY
    try {
        $env:ELEVENLABS_API_KEY = 'test-elevenlabs-key'
        $env:OPENAI_API_KEY = 'test-openai-key'
        & (Join-Path $clone 'Bootstrap-From-Git.ps1') -MediaRoot $media -ApproveSuppliedBroll -UseOpenAIImages -PrepareOnly
    } finally {
        $env:ELEVENLABS_API_KEY = $priorElevenLabs
        $env:OPENAI_API_KEY = $priorOpenAi
    }
    $settings = @{}
    foreach ($line in Get-Content -LiteralPath (Join-Path $clone 'runtime\n8n\.env')) {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
    }
    if ($settings['LLM_PROVIDER'] -ne 'openai' -or $settings['IMAGE_PROVIDER'] -ne 'openai' -or
        $settings['GEMINI_API_KEY'] -ne '' -or $settings['AUTO_PROCESS_NEW_VIDEOS'] -ne 'false' -or
        -not (Test-Path -LiteralPath (Join-Path $clone 'video-control.csv'))) {
        throw 'Private setup or queue initialization failed.'
    }
    Write-Host 'Clone bootstrap smoke tests passed.'
} finally {
    $resolved = [IO.Path]::GetFullPath($scratch)
    $allowed = [IO.Path]::GetFullPath($PSScriptRoot) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or
        -not [IO.Path]::GetFileName($resolved).StartsWith('.smoke-')) { throw 'Unsafe smoke-test cleanup path.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
