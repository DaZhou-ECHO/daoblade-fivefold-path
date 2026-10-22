param(
    [ValidateRange(1024,65535)][int]$Port = 5064,
    [string]$DatabasePath = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pythonPath = Join-Path $projectRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) {
    throw '缺少 .venv。请先按 LOCAL_DEVELOPMENT.md 创建环境并安装 requirements.txt。'
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "端口 $Port 已占用。请先检查已有游戏服务，或使用 -Port 指定其他端口；不会终止已有进程。"
}
if (!$DatabasePath) {
    $DatabasePath = if ($env:DAOBLADE_DATABASE) { $env:DAOBLADE_DATABASE } else { Join-Path $projectRoot 'instance/daoblade.sqlite3' }
}
if (![IO.Path]::IsPathRooted($DatabasePath)) { $DatabasePath = Join-Path $projectRoot $DatabasePath }
$DatabasePath = [IO.Path]::GetFullPath($DatabasePath)
$previousDatabase = $env:DAOBLADE_DATABASE
Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Force -Path (Split-Path $DatabasePath -Parent) | Out-Null
    $env:DAOBLADE_DATABASE = $DatabasePath
    Write-Host "本地游戏：http://127.0.0.1:$Port/"
    Write-Host "存档数据库：$DatabasePath"
    Write-Host '从“开始正式征程”进入。请保留此窗口；Ctrl+C停止，重开仍读取同一数据库。'
    & $pythonPath -m flask --app app run --host 127.0.0.1 --no-reload --port $Port
    if ($LASTEXITCODE -ne 0) { throw "游戏启动失败，退出码 $LASTEXITCODE。请检查上方输出。" }
} finally {
    $env:DAOBLADE_DATABASE = $previousDatabase
    Pop-Location
}
