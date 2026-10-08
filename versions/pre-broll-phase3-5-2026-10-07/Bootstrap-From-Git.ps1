param(
    [string]$MediaRoot,
    [string]$BrollFolder,
    [switch]$ApproveSuppliedBroll,
    [switch]$UseOpenAIImages,
    [switch]$PrepareOnly,
    [switch]$Plan
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$compose = Join-Path $projectRoot 'runtime\clone\docker-compose.yml'
$envFile = Join-Path $projectRoot 'runtime\n8n\.env'
$envExample = Join-Path $projectRoot 'runtime\n8n\.env.example'

if ($Plan) {
    Write-Host 'Fresh-clone setup plan: import supplied media without overwriting files; create an ignored queue and private non-Gemini environment; install/start Docker Desktop if needed; build n8n and a CPU vector image; download/index the public SigLIP2 model; start services; import the inactive workflow; run local checks.'
    Write-Host 'This plan does not make provider calls, render videos, or publish social posts.'
    return
}

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
    throw 'This one-command bootstrap currently supports Windows. The Docker Compose stack is portable, but the bootstrap launcher is Windows PowerShell.'
}
if (-not $MediaRoot) { $MediaRoot = Read-Host 'Folder containing your media (incoming and optional broll-assets/product-assets/reference-assets)' }
if (-not (Test-Path -LiteralPath $MediaRoot -PathType Container)) { throw "Media folder not found: $MediaRoot" }
$MediaRoot = (Resolve-Path -LiteralPath $MediaRoot).Path

function Read-PrivateValue([string]$variableName, [string]$label) {
    $existing = [Environment]::GetEnvironmentVariable($variableName, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($existing)) { return $existing }
    $secure = Read-Host $label -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ([string]::IsNullOrWhiteSpace($value) -or $value -match '[\r\n]') { throw "$variableName must be a nonempty single-line value" }
    return $value
}

function New-PrivateEnvironment {
    if (Test-Path -LiteralPath $envFile -PathType Leaf) {
        $settings = @{}
        foreach ($line in Get-Content -LiteralPath $envFile) {
            if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
        }
        if ($settings['LLM_PROVIDER'] -ne 'openai' -or $settings['IMAGE_PROVIDER'] -ne 'openai' -or
            $settings['LLM_API_URL'] -ne 'https://api.openai.com/v1/chat/completions' -or
            $settings['IMAGE_API_URL'] -ne 'https://api.openai.com/v1/images/generations' -or
            $settings['AUTO_PROCESS_NEW_VIDEOS'] -ne 'false') {
            throw 'Existing runtime/n8n/.env does not select the verified OpenAI endpoints. It was not changed. Use a fresh clone or review that private file before bootstrap.'
        }
        foreach ($name in @('ELEVENLABS_API_KEY', 'LLM_API_KEY', 'IMAGE_API_KEY', 'N8N_ENCRYPTION_KEY')) {
            if (-not $settings.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($settings[$name])) {
                throw "Existing private environment is missing $name. It was not changed."
            }
        }
        return
    }

    $choice = if ($UseOpenAIImages) { 'YES' } else { Read-Host 'For fully automatic still-image generation, use the OpenAI Images API with your key? Type YES to authorize' }
    if ($choice -cne 'YES') {
        throw 'Unattended image generation cannot call the Codex in-chat image tool. No private environment was created. Ask a Codex agent to run an isolated sample, or explicitly authorize the OpenAI Images API.'
    }
    $elevenLabsKey = Read-PrivateValue 'ELEVENLABS_API_KEY' 'ElevenLabs API key (hidden)'
    $openAiKey = Read-PrivateValue 'OPENAI_API_KEY' 'OpenAI API key for planning, captions, and stills (hidden)'
    $random = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($random) } finally { $generator.Dispose() }
    $encryptionKey = [Convert]::ToBase64String($random)
    $values = @{
        N8N_ENCRYPTION_KEY = $encryptionKey
        ELEVENLABS_API_KEY = $elevenLabsKey
        GEMINI_API_KEY = ''
        LLM_PROVIDER = 'openai'
        LLM_API_KEY = $openAiKey
        LLM_API_URL = 'https://api.openai.com/v1/chat/completions'
        LLM_MODEL = 'gpt-4o-mini'
        IMAGE_PROVIDER = 'openai'
        IMAGE_API_KEY = $openAiKey
        IMAGE_API_URL = 'https://api.openai.com/v1/images/generations'
        IMAGE_MODEL = 'gpt-image-1'
        IMAGE_SIZE = '1024x1024'
        AUTO_PROCESS_NEW_VIDEOS = 'false'
    }
    $lines = foreach ($line in Get-Content -LiteralPath $envExample) {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=') {
            $name = $Matches[1]
            if ($values.ContainsKey($name)) { "$name=$($values[$name])" } else { $line }
        } else { $line }
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($envFile, [string[]]$lines, $utf8)
    $elevenLabsKey = $null
    $openAiKey = $null
    Write-Host 'Created ignored runtime/n8n/.env with a non-Gemini configuration. Key values were not displayed.'
}

function Resolve-DockerExecutable {
    $command = Get-Command docker -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    )
    foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate } }
    return $null
}

function Ensure-Docker {
    $dockerExe = Resolve-DockerExecutable
    if (-not $dockerExe) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Host 'Installing Docker Desktop with Windows Package Manager...'
            & $winget.Source install --exact --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
            if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop installation failed. Complete its system setup, then rerun this same command.' }
        } else {
            $installerDir = Join-Path $projectRoot 'runtime\tools'
            New-Item -ItemType Directory -Path $installerDir -Force | Out-Null
            $installer = Join-Path $installerDir 'Docker Desktop Installer.exe'
            Write-Host 'Downloading the official Docker Desktop Windows installer...'
            Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $installer -UseBasicParsing
            $install = Start-Process -FilePath $installer -ArgumentList @('install', '--user', '--quiet') -Wait -PassThru -WindowStyle Hidden
            if ($install.ExitCode -ne 0) { throw 'Docker Desktop installation failed. Complete its system setup, then rerun this same command.' }
        }
        $dockerExe = Resolve-DockerExecutable
        if (-not $dockerExe) { throw 'Docker Desktop installed but docker.exe was not found. Rerun this command after the installer or reboot completes.' }
    }
    & $dockerExe info *> $null
    if ($LASTEXITCODE -ne 0) {
        $desktopCandidates = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
            (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
        )
        foreach ($candidate in $desktopCandidates) {
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                Start-Process -FilePath $candidate | Out-Null
                break
            }
        }
        Write-Host 'Waiting for Docker Desktop Linux engine. Complete any first-run terms or WSL prompt in Docker Desktop.'
        for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
            Start-Sleep -Seconds 5
            & $dockerExe info *> $null
            if ($LASTEXITCODE -eq 0) { break }
        }
        if ($LASTEXITCODE -ne 0) { throw 'Docker Linux engine is unavailable. Complete Docker Desktop first-run/WSL setup or reboot, then rerun this same command.' }
    }
    $engineType = (& $dockerExe info --format '{{.OSType}}' 2>$null).Trim()
    if ($engineType -ne 'linux') { throw 'Docker Desktop is not using its Linux engine. Switch to Linux containers and rerun this command.' }
    return $dockerExe
}

$brollSource = if ($BrollFolder) { $BrollFolder } else { Join-Path $MediaRoot 'broll-assets' }
if (-not $ApproveSuppliedBroll -and (Test-Path -LiteralPath $brollSource -PathType Container)) {
    $suppliedBroll = @(Get-ChildItem -LiteralPath $brollSource -File -Recurse | Where-Object { $_.Extension -match '^(?i)\.(mp4|mov|mkv|webm|avi|m4v)$' })
    if ($suppliedBroll.Count) {
        $rights = Read-Host 'Confirm you own/license and approve the supplied B-roll for use. Type YES to approve'
        if ($rights -cne 'YES') { throw 'Supplied B-roll was not approved. No media was copied.' }
        $ApproveSuppliedBroll = $true
    }
}

& (Join-Path $projectRoot 'runtime\clone\Import-Supplied-Media.ps1') -MediaRoot $MediaRoot -DestinationRoot $projectRoot -BrollFolder $BrollFolder -ApproveSuppliedBroll:$ApproveSuppliedBroll
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'video-control.csv') -PathType Leaf)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot 'video-control.example.csv') -Destination (Join-Path $projectRoot 'video-control.csv')
}
foreach ($directory in @('processed', 'runtime\n8n\data', 'runtime\vector-cache\models', 'publishing\queue')) {
    New-Item -ItemType Directory -Path (Join-Path $projectRoot $directory) -Force | Out-Null
}
New-PrivateEnvironment
if ($PrepareOnly) {
    Write-Host 'Media, tracker, and private non-Gemini configuration are prepared. Docker steps were skipped by request.'
    return
}
$approvedCount = 0
$maps = @(
    @{ path = (Join-Path $projectRoot 'broll-assets\asset-map.json'); approvals = (Join-Path $projectRoot 'approved-stock-ids.json') },
    @{ path = (Join-Path $projectRoot 'broll-assets\local-asset-map.json'); approvals = (Join-Path $projectRoot 'local-approved-stock-ids.json') }
)
foreach ($pair in $maps) {
    if (-not (Test-Path -LiteralPath $pair.path -PathType Leaf) -or -not (Test-Path -LiteralPath $pair.approvals -PathType Leaf)) { continue }
    $map = (Get-Content -LiteralPath $pair.path -Raw | ConvertFrom-Json).assets
    foreach ($id in @(Get-Content -LiteralPath $pair.approvals -Raw | ConvertFrom-Json)) {
        $filename = $map.PSObject.Properties[$id].Value
        if ($filename -and (Test-Path -LiteralPath (Join-Path $projectRoot ('broll-assets\' + $filename)) -PathType Leaf)) { $approvedCount += 1 }
    }
}
$withVector = $approvedCount -gt 0
$dockerExe = Ensure-Docker
& $dockerExe compose -f $compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Clone Docker Compose configuration is invalid.' }
if ($withVector) { & $dockerExe compose -f $compose --profile with-vector build n8n vector }
else { & $dockerExe compose -f $compose build n8n }
if ($LASTEXITCODE -ne 0) { throw 'Container build failed. Rerun this same command after resolving the Docker/network error.' }

if ($withVector) {
    Write-Host "Indexing $approvedCount approved local B-roll clips. The first model download may take time."
    & $dockerExe compose -f $compose --profile with-vector run --rm --no-deps vector python vector-index/index_clips.py --root broll-assets --db vector-index/local-clips.sqlite --allow-cpu
    if ($LASTEXITCODE -notin @(0, 2)) { throw 'Vector indexing failed before a usable index was created.' }
    if ($LASTEXITCODE -eq 2) { Write-Warning 'Some supplied clips could not be indexed; successful clips are retained. Check logs/index-errors.txt.' }
    & $dockerExe compose -f $compose --profile with-vector up -d n8n vector
} else {
    Write-Warning 'No approved local B-roll clip is present. The vector service will stay off; the planner can still use exact supplied photos or generated stills.'
    & $dockerExe compose -f $compose up -d n8n
}
if ($LASTEXITCODE -ne 0) { throw 'n8n/vector containers failed to start.' }

$healthy = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:5678/healthz' -UseBasicParsing -TimeoutSec 3 | Out-Null
        $healthy = $true
        break
    } catch { Start-Sleep -Seconds 3 }
}
if (-not $healthy) { throw 'n8n did not become healthy. Inspect docker compose logs, then rerun this same command.' }

$importMarker = Join-Path $projectRoot 'runtime\n8n\data\.heygen-workflow-imported'
if (-not (Test-Path -LiteralPath $importMarker -PathType Leaf)) {
    & $dockerExe compose -f $compose exec -T n8n n8n import:workflow --input=/files/heygen-workflow/video-broll-factory-workflow.json
    if ($LASTEXITCODE -ne 0) { throw 'n8n is running, but workflow import failed.' }
    New-Item -ItemType File -Path $importMarker -Force | Out-Null
}
& $dockerExe compose -f $compose exec -T n8n node /files/heygen-workflow/caption-grammar.test.js
if ($LASTEXITCODE -ne 0) { throw 'Caption tests failed inside the n8n runtime.' }
& $dockerExe compose -f $compose exec -T n8n node /files/heygen-workflow/local-media-catalog.test.js
if ($LASTEXITCODE -ne 0) { throw 'Local media catalog tests failed inside the n8n runtime.' }
Write-Host 'Clone setup complete. n8n is at http://127.0.0.1:5678; the imported workflow schedule remains inactive. Review the first video before enabling production automation.' -ForegroundColor Green
