param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPython = Join-Path $taskRepoRoot '.venv\Scripts\python.exe'
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not (Test-Path -LiteralPath $taskPython)) {
    throw 'Missing project .venv. Create it with Python 3.11+ and install requirements.txt first.'
}
if (-not $taskNodeCommand) { throw 'Node.js is required for frontend checks (not for playing the game).' }

function Invoke-ProjectCheck {
    param([string]$Label, [string]$Executable, [string[]]$CheckArguments)
    Write-Host "`n[$Label]"
    & $Executable @CheckArguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

$taskPreviousDatabase = $env:DAOBLADE_DATABASE
Push-Location -LiteralPath $taskRepoRoot
try {
    $env:DAOBLADE_DATABASE = Join-Path $taskRepoRoot 'work\check-project.sqlite3'
    $taskTemp = [IO.Path]::GetFullPath((Join-Path $taskRepoRoot '.pytest-tmp-character-check'))
    if (-not $taskTemp.StartsWith($taskRepoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'pytest temporary directory must remain inside this repository.'
    }
    Invoke-ProjectCheck 'Python tests' $taskPython @('-m', 'pytest', '-q', '-p', 'no:cacheprovider', '--basetemp', $taskTemp)
    Invoke-ProjectCheck 'Frontend tests (node --test discovery)' $taskNodeCommand.Source @('--test')
    foreach ($taskScript in (Get-ChildItem -LiteralPath (Join-Path $taskRepoRoot 'static\js') -Filter '*.js' -File | Sort-Object Name)) {
        Invoke-ProjectCheck ("JS syntax: " + $taskScript.Name) $taskNodeCommand.Source @('--check', $taskScript.FullName)
    }
    $taskPillow = (& $taskPython -c "import importlib.util; print('yes' if importlib.util.find_spec('PIL') else 'no')").Trim()
    if ($taskPillow -eq 'yes') {
        Invoke-ProjectCheck 'Character sprite validation' $taskPython @('tools/check_character_art.py')
        Invoke-ProjectCheck 'World sprite validation' $taskPython @('tools/check_world_art.py')
    } else {
        Write-Host "`n[Art checks skipped] Pillow missing. Install it with: .\.venv\Scripts\python.exe -m pip install -r requirements-art.txt"
    }
    Invoke-ProjectCheck 'Agent document files and links' $taskPython @('tools/check_agent_docs.py')
    Invoke-ProjectCheck 'Git whitespace' 'git' @('diff', '--check')
    Write-Host "`nAll local checks passed. Browser/visual/audio acceptance is recorded separately."
} finally {
    $env:DAOBLADE_DATABASE = $taskPreviousDatabase
    Pop-Location
}
