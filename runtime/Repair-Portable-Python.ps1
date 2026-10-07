$ErrorActionPreference = 'Stop'

$runtimeRoot = Join-Path $PSScriptRoot 'vector-cache'
$venvRoot = Join-Path $runtimeRoot 'venv'
$pythonRoot = Join-Path $runtimeRoot 'python'
$uv = Join-Path $PSScriptRoot 'tools\uv.exe'
$requirements = Join-Path $PSScriptRoot 'requirements-vector.txt'
$pythonHome = Get-ChildItem -LiteralPath $pythonRoot -Directory -ErrorAction Stop |
    Where-Object Name -Match '^cpython-\d+\.\d+\.\d+-windows-' |
    Select-Object -First 1

if (-not $pythonHome) {
    throw "Bundled CPython was not found under $pythonRoot"
}

$configPath = Join-Path $venvRoot 'pyvenv.cfg'
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'

function New-VectorEnvironment {
    if (-not (Test-Path -LiteralPath $uv -PathType Leaf)) {
        throw "Bundled uv was not found at $uv"
    }
    $basePython = Join-Path $pythonHome.FullName 'python.exe'
    if (-not (Test-Path -LiteralPath $basePython -PathType Leaf)) {
        throw "Bundled Python was not found at $basePython"
    }
    & $uv venv --clear --relocatable --python $basePython $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to recreate the vector environment.' }
    & $uv pip install --python $venvPython --extra-index-url 'https://download.pytorch.org/whl/cu128' -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Unable to install the vector requirements.' }
}

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    New-VectorEnvironment
}

$lines = Get-Content -LiteralPath $configPath
$homeLine = 'home = ' + $pythonHome.FullName
$foundHome = $false
$updated = foreach ($line in $lines) {
    if ($line -match '^home\s*=') {
        $foundHome = $true
        $homeLine
    } else {
        $line
    }
}
if (-not $foundHome) {
    $updated = @($homeLine) + @($updated)
}
[IO.File]::WriteAllLines($configPath, [string[]]$updated, [Text.UTF8Encoding]::new($false))

# uv-created activation helpers embed the creation path even though the launchers
# call python.exe directly. Refresh those strings so manual activation also works
# after the project folder moves.
foreach ($name in @('activate', 'activate.bat', 'activate.csh', 'activate.fish', 'activate.nu')) {
    $activationPath = Join-Path $venvRoot ('Scripts\' + $name)
    if (-not (Test-Path -LiteralPath $activationPath -PathType Leaf)) { continue }
    $activationLines = foreach ($line in Get-Content -LiteralPath $activationPath) {
        if ($line -match '(?i)virtual_env') {
            $line = [regex]::Replace($line, "'[A-Za-z]:\\[^']*\\venv'", "'$venvRoot'")
            $line = [regex]::Replace($line, '"[A-Za-z]:\\[^\"]*\\venv"', '"' + $venvRoot + '"')
        }
        $line
    }
    [IO.File]::WriteAllLines($activationPath, [string[]]$activationLines, [Text.UTF8Encoding]::new($false))
}

& $venvPython -c 'import numpy, torch, transformers; print("Portable vector Python is ready; CUDA=" + str(torch.cuda.is_available()))'
if ($LASTEXITCODE -ne 0) {
    Write-Host 'The moved environment needs rebuilding. Downloading pinned packages...' -ForegroundColor Yellow
    New-VectorEnvironment
    & $venvPython -c 'import numpy, torch, transformers; print("Rebuilt vector Python is ready; CUDA=" + str(torch.cuda.is_available()))'
    if ($LASTEXITCODE -ne 0) {
        throw 'The rebuilt vector Python environment failed its import check.'
    }
}
