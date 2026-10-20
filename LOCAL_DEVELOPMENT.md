# 本地开发接续

这份说明针对本地迭代副本；003及之后的工作尚未上传，不能把它当作远端main状态。

## 新Codex从哪里开始

1. 读取根目录[AGENTS.md](AGENTS.md)。
2. 查看[任务索引](docs/agents/README.md)，读取最新相关Agent交接。
3. 执行`git status --short --branch`与`git log -5 --oneline`核对现场。
4. 在交接列明的任务范围内接续；任何上传等待用户明确通知。

003以后采用本地串行检查点分支；当前分支包含前序成果。编号尚未在远端协调，上传前须检查冲突及与002规范的整合。不要从旧分支覆盖最新成果。

## 首次准备

在项目根目录打开PowerShell：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

已有.venv时直接使用，不反复重建。游戏无需Node.js；本地前端检查需要Node.js。没有新增前端包或构建步骤。

## 隔离试玩

```powershell
$env:DAOBLADE_DATABASE = Join-Path (Get-Location) 'work/local-play.sqlite3'
.\.venv\Scripts\python.exe -m flask --app app run --no-reload --port 5064
```

打开`http://127.0.0.1:5064/`；`Ctrl+C`停止。此命令使用独立测试存档，避免改动个人正式进度。端口占用时先核对已有进程，不重复启动或随意终止他人的服务。非debug模式修改模板后需重启服务；单纯刷新不能保证刷新Flask模板缓存。

角色预览位于`/static/character-preview.html`。音效默认关闭，命中与格挡文字可在暂停→按键设置中关闭。

## 统一自检

```powershell
.\tools\check-project.ps1
```

检查Python测试、自动发现的`tests/*.test.cjs`、全部`static/js/*.js`语法、Agent目录必需文件和本地链接、Git空白差异。任何检查失败即停止并返回失败；不会安装依赖、推送或修改正式存档。Python临时目录是专用`.pytest-tmp-character-check`，仅用于自检。

如果当前PowerShell策略不允许运行脚本，不修改系统策略；按README逐项运行Python/Node命令，并执行`.\.venv\Scripts\python.exe tools/check_agent_docs.py`。脚本检查不替代浏览器、视觉或实际听感验收，这些结果记录在每个Agent的交接中。
