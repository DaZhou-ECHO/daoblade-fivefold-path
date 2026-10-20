# 《本命剑：八荒五行》GitHub 团队维护手册

适用仓库：<https://github.com/DaZhou-ECHO/daoblade-fivefold-path>

2026-10-20补充：初版分方向任务采用补零轮次命名，见[顺序编号与候选维护](GitHub顺序编号与候选维护.md)与[实施索引](implementation/00-实施索引.md)。当前完整候选包含尚未进入develop的依赖，不能直接套用旧版“从develop开始”的示例；先以本轮交接确认基线。以下2026-10-19仓库检查仅为历史快照。

## 1. 管理目标

本项目采用“一名成员一天轮流开发，晚上由主管理员验收”的工作方式。版本管理需要同时满足以下目标：

1. `main` 中始终保留可以运行、可以展示的版本；
2. 团队成员不能直接覆盖正式版本；
3. 每天的工作可以独立审核、退回和撤销；
4. 可以保存大量版本记录，但不重复上传虚拟环境、数据库和压缩包；
5. 流程足够简单，不引入长期存在的大量分支。

## 2. 角色与权限

### 主管理员

主管理员负责：

- 管理仓库成员权限；
- 审核 Pull Request；
- 决定代码是否进入 `develop`；
- 决定何时从 `develop` 发布到 `main`；
- 修改版本号和维护 `CHANGELOG.md`；
- 创建 Git 标签和 GitHub Release；
- 处理紧急回滚和冲突裁决。

主管理员不应代替成员修改其功能分支。需要修改时，应在 PR 中提出意见，让原开发者继续提交到同一个分支。

### 当日开发成员

当日开发成员负责：

- 早上从远程 `develop` 获取最新代码；
- 为当天任务创建一个短期分支；
- 只提交与当天任务有关的文件；
- 运行测试并记录结果；
- 晚上推送分支并创建 PR；
- 根据主管理员意见继续修复；
- PR 合并后删除当天分支。

## 3. 精简分支结构

仓库长期只保留两个分支：

```text
main       已通过验收的可运行版本
develop    下一版本的最新集成代码
```

每位成员每天创建一个短期工作分支：

```text
work/<成员名>/<日期>-<任务>
```

示例：

```text
work/zhang/20261020-fire-boss
work/li/20261021-player-dash
work/wang/20261022-bagua-ui
```

修复正式版本的紧急问题时使用：

```text
hotfix/<问题名称>
```

工作分支在 PR 合并后立即删除。因此仓库通常只有 `main`、`develop` 和一个正在使用的工作分支，不会长期堆积大量分支。

## 4. 版本号规则

使用语义化版本：

```text
v主版本.次版本.修订版本
```

示例：

| 版本 | 用途 |
|---|---|
| `v0.1.0` | 第一版可玩原型 |
| `v0.1.1` | 修复角色悬空等问题 |
| `v0.2.0` | 熔岩天宫完整体验版 |
| `v0.3.0` | 增加新的正式关卡或成长系统 |
| `v1.0.0` | 课程设计正式交付版 |

需要保存每日验收版本时，使用预发布编号：

```text
v0.2.0-dev.1
v0.2.0-dev.2
v0.2.0-dev.3
```

规则如下：

- 普通成员不能创建版本标签；
- 每次提交和 PR 已经可以保存开发历史，不需要为每个提交创建 Release；
- 主管理员验收通过的每日版本可以创建 `dev` 标签；
- 完成一个阶段目标后创建正式版本，例如 `v0.2.0`；
- 不删除已经发布的版本号。发现问题时创建下一个修订版本；
- 不上传手工制作的源码 ZIP，GitHub 会为每个标签自动生成 ZIP 和 tar.gz；
- 大型可执行程序或素材包只在确实需要交付时附加到 Release。

建议在仓库根目录维护纯文本 `VERSION` 文件：

```text
0.2.0-dev.1
```

同时维护 `CHANGELOG.md`，每个验收版本只记录用户能感知的新增、修复和已知问题。

## 5. 第一次建立团队分支

由主管理员执行一次：

```powershell
cd D:\acode\xju_code\daoblade-fivefold-path

git switch main
git pull --ff-only origin main
git switch -c develop
git push -u origin develop
```

随后在 GitHub 中为 `develop` 增加保护规则，并邀请团队成员加入仓库。

推荐权限：

- 主管理员：`Maintain` 或仓库所有者；
- 普通成员：`Write`；
- 不给普通成员 `Admin` 权限。

## 6. 团队成员首次克隆

```powershell
cd D:\你的代码目录
git clone https://github.com/DaZhou-ECHO/daoblade-fivefold-path.git
cd daoblade-fivefold-path

git switch develop
git pull --ff-only origin develop

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

`.venv`、SQLite 存档和本机 `.env` 不能提交到 GitHub。

## 7. 每日工作流程

### 7.1 早上：获取最新版本

当日成员先确认自己没有未提交的修改：

```powershell
cd D:\你的代码目录\daoblade-fivefold-path
git status
```

然后更新 `develop`：

```powershell
git switch develop
git pull --ff-only origin develop
```

创建当天的工作分支：

```powershell
git switch -c work/zhang/20261020-fire-boss
```

不要直接在 `main` 或 `develop` 上开发。

### 7.2 白天：小步提交

查看改动：

```powershell
git status
git diff
```

按任务选择文件，不要未经检查直接提交所有内容：

```powershell
git add static/js/game.js tests/test_rules.py
git commit -m "feat: 增加离火剑魁第二阶段"
```

一天可以有多个小提交，例如：

```text
feat: 增加首领突进斩
feat: 增加首领二阶段剑波
test: 增加首领状态切换测试
docs: 更新火属性关卡说明
```

### 7.3 晚上：同步、测试和上传

先获取当天其他已经合并的代码：

```powershell
git fetch origin
git rebase origin/develop
```

如果出现冲突，解决冲突后执行：

```powershell
git add <已经解决的文件>
git rebase --continue
```

运行检查：

```powershell
.\.venv\Scripts\python.exe -m pytest -q
node --check static/js/game.js
```

确认状态：

```powershell
git status
git log --oneline -5
```

第一次上传当天分支：

```powershell
git push -u origin work/zhang/20261020-fire-boss
```

已推送的共享候选不应再通过rebase改写。若与基线分叉，保留两侧提交并与负责人协调；自动任务暂停推送，不以强制推送解决。

```powershell
git fetch origin
git status
```

以上只检查状态，不覆盖远端。当前顺序编号工作流只使用普通推送；旧示例中的rebase只适用于尚未推送且已确认没有协作者的本地分支，不作为自动任务默认步骤。

上传后，在 GitHub 创建：

```text
work/zhang/20261020-fire-boss → develop
```

## 8. Pull Request 内容

标题示例：

```text
feat: 完成离火剑魁二阶段战斗
```

正文使用以下格式：

```markdown
## 本次修改

- 增加首领二阶段
- 增加地面火焰剑波
- 增加攻击预警效果

## 验证步骤

1. 启动项目并进入熔岩天宫
2. 将首领生命降至 50%
3. 检查阶段切换、剑波和伤害

## 测试结果

- pytest：12 passed
- JavaScript 语法检查：通过

## 已知问题

- 数值仍需试玩调整
```

PR 不应混入与任务无关的代码格式调整、大量文件重命名或个人编辑器配置。

## 9. 主管理员晚间验收流程

### 9.1 查看 PR

主管理员检查：

1. PR 目标是否为 `develop`；
2. 文件是否都属于当天任务；
3. 是否提交了 `.venv`、数据库、缓存、密钥或临时文件；
4. 是否修改了他人负责模块；
5. 是否提供验证步骤和真实测试结果；
6. 代码能否运行，玩法是否符合设计；
7. 文档是否需要同步更新。

### 9.2 本地评测 PR

```powershell
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c review/fire-boss origin/work/zhang/20261020-fire-boss

python -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
node --check static/js/game.js
python -m flask --app app run --debug
```

评测结束后切回：

```powershell
git switch develop
git branch -D review/fire-boss
```

`review/*` 只用于管理员本地检查，不推送到 GitHub。

### 9.3 合并方式

功能 PR 推荐使用 **Squash and merge**。一天的多个实验提交会被合并成一条清楚的集成记录。

合并信息示例：

```text
feat: 完成离火剑魁二阶段战斗 (#12)
```

合并后删除远程工作分支。

需要修改时选择 **Request changes**，不要先合并再要求成员修复。

## 10. 管理员生成验收版本

PR 合并后，主管理员更新本地 `develop`：

```powershell
git switch develop
git pull --ff-only origin develop
```

确认测试通过后，更新 `VERSION` 和 `CHANGELOG.md`：

```powershell
git add VERSION CHANGELOG.md
git commit -m "chore: 准备 v0.2.0-dev.1"
git push origin develop
```

创建每日验收标签：

```powershell
git tag -a v0.2.0-dev.1 -m "熔岩天宫开发验收版本 1"
git push origin v0.2.0-dev.1
```

每日版本通常只需要标签。需要让老师或测试人员下载时，再在 GitHub Releases 中标记为 **Pre-release** 并填写说明。

## 11. 发布正式阶段版本

当 `develop` 达到阶段目标后，在 GitHub 创建 PR：

```text
develop → main
```

该 PR 必须包含：

- 功能清单；
- 实际测试结果；
- 已知问题；
- 对应课程文档变化。

合并后，主管理员运行：

```powershell
git switch main
git pull --ff-only origin main

git tag -a v0.2.0 -m "熔岩天宫完整体验版"
git push origin v0.2.0
```

然后在 GitHub 创建 Release。Release 标题示例：

```text
《本命剑：八荒五行》v0.2.0 熔岩天宫体验版
```

不要把未经验收的 `develop` 直接标记为正式 Release。

## 12. 分支保护建议

### `main`

- Require a pull request before merging；
- Require at least 1 approval；
- Require status checks to pass；
- Require conversation resolution；
- Block force pushes；
- Block deletions；
- 普通成员不能绕过规则。

### `develop`

- Require a pull request before merging；
- Require status checks to pass；
- Block force pushes；
- Block deletions；
- 由主管理员负责最终合并。

建议增加 `.github/CODEOWNERS`：

```text
* @DaZhou-ECHO
```

这样所有 PR 都会自动请求主管理员审查。

## 13. 自动测试建议

仓库至少应增加一个 GitHub Actions 工作流，在向 `develop` 或 `main` 创建 PR 时执行：

```text
python -m pip install -r requirements.txt
python -m pytest -q
node --check static/js/game.js
```

自动检查通过后才能合并。它只负责验证基础规则，不代替管理员实际试玩。

## 14. 文件管理要求

禁止提交：

```text
.venv/
__pycache__/
.pytest_cache/
.env
instance/*.sqlite3
instance/*.db
个人存档
临时截图
编辑器缓存
```

像素素材、音频和视频需要遵循以下规则：

- 普通 PNG、JSON 和小型音效可以直接提交；
- 单个文件接近 50 MB 时先与管理员确认；
- 不提交超过 GitHub 100 MB 限制的文件；
- 大型音频、视频和源美术工程可以使用 Git LFS；
- 不要同时提交源文件、导出文件和多个重复压缩包。

## 15. 冲突和故障处理

### 当天代码与 `develop` 冲突

```powershell
git fetch origin
git rebase origin/develop
```

逐个解决冲突，不要直接选择“全部保留自己的版本”。解决后重新运行全部测试。

### 错误代码已经合并到 `develop`

优先使用 GitHub PR 页面中的 **Revert**，或者由管理员运行：

```powershell
git switch develop
git pull --ff-only origin develop
git revert <错误提交SHA>
git push origin develop
```

不要使用 `git reset --hard` 改写共享分支历史。

### 正式版本发现问题

从 `main` 创建紧急修复：

```powershell
git switch main
git pull --ff-only origin main
git switch -c hotfix/player-save-error
```

修复后创建 `hotfix/* → main` 的 PR，发布新的修订版本，例如 `v0.2.1`。随后把同样的修复合并回 `develop`。

## 16. 历史仓库检查结果（2026-10-19快照）

检查日期：2026-10-19。

当前状态：

- 仓库为公开仓库；
- 默认分支为 `main`；
- `main` 已显示为受保护分支；
- 当前只有 `main` 一个分支；
- 当前只有一条提交：`bb3c382 chore: initial commit`；
- 已创建 `v0.1.0` 标签和正式 Release；
- Release 已包含新增功能和已知问题；
- 本地 `main`、`origin/main` 和 `v0.1.0` 指向同一个提交；
- 本地工作区检查时没有未提交修改；
- GitHub Actions 尚未配置；
- 尚未建立 `develop`；
- 尚未发现 PR 模板、`CODEOWNERS`、`VERSION` 或 `CHANGELOG.md`；
- 仓库 About 区域尚未填写简介、网站和主题标签；
- 仓库中存在临时路径测试文件 `codex-write-test.txt`；
- 公开页面无法确认分支保护规则的全部详细选项，需要主管理员登录后检查。

建议按以下顺序完善：

1. 创建并保护 `develop`；
2. 增加 GitHub Actions 自动测试；
3. 增加 PR 模板和 `CODEOWNERS`；
4. 增加 `VERSION` 与 `CHANGELOG.md`；
5. 通过普通 PR 删除 `codex-write-test.txt`；
6. 填写仓库简介和主题标签；
7. 邀请成员并授予 `Write` 权限；
8. 从下一项功能开始执行每日轮班流程。

## 17. 每日速查表

成员早上：

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c work/<姓名>/<日期>-<任务>
```

成员晚上：

```powershell
git fetch origin
git rebase origin/develop
.\.venv\Scripts\python.exe -m pytest -q
node --check static/js/game.js
git push -u origin work/<姓名>/<日期>-<任务>
```

管理员晚上：

```text
查看 PR → 检查文件 → 自动测试 → 本地试玩 → 审核意见
→ Squash 合并到 develop → 删除工作分支 → 更新版本记录
```

阶段发布：

```text
develop → main 的 PR → 全量测试 → 合并 → 创建正式标签 → 创建 GitHub Release
```
