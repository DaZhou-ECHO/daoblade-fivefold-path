# 本命剑：八荒五行

[![DaoBlade checks](https://github.com/DaZhou-ECHO/daoblade-fivefold-path/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/DaZhou-ECHO/daoblade-fivefold-path/actions/workflows/ci.yml)

> 当前工作轮次：051「工程化收尾与健壮性」，基线 `develop` 43afe4d。本轮在 GitHub Actions 启用 CI，补上会话密钥持久化、API JSON 错误与健康检查，并把本地自检统一为一条命令。记录见[051实施](docs/implementation/051-工程化收尾.md)与[051交接](docs/agents/051-engineering-hardening/agents/agent-20261123-1900-h051/HANDOFF.md)。

**DaoBlade: Fivefold Path** 是一个可在浏览器运行的横版修仙动作游戏。角色从青云新手村出发，与山河图、师父和商人交互；挑战五境各两张地图，获得本位灵珠、修为与外观券，配置八宫出战并突破筑基。

## 第一次玩

1. 启动服务打开页面，先登录或注册，再选择三个独立征程之一；已有会话也先选档。游客入口保留一个本机槽。可在选档页创建、重命名、确认名称后删除存档；有进行中挑战须先处理。读取失败留在当前入口重试，不切换到其他档案。旧账号正式进度自动登记为第一槽，原奖励流水保留。
2. 新手村按 A/D 行走，靠近传送台、悬赏栏、师父、剑台或商人按 F，也可直接点击。边缘入口是地图、行囊、八宫、任务和设置。地图按地理地区选择高径或回廊，路线卡直接进入正式战斗；未完成挑战可恢复。设置中可返回选档、切换账号及查看操作。
3. 关卡内用 Space 跳跃、J 近战、K 格挡、松开 L 释放剑气、Shift 闪避，Q/E 使用出战技能。新挑战中下＋J可挑剑／坠剑，长按 L 0.45秒后松开可蓄剑；主宫满足起式条件后1秒内新按副宫键接招。前三敌清场后触碰剑碑；祭坛是可选支路。
4. 路线胜利仍获得灵珠、至少12修为和1外观券。八宫在独立剑台界面调整，四张出战符牌与保存栏固定于底部；师父只处理剑术/身法/护体与筑基心劫。草稿保存后才生效，挑战期间冻结。新档已装起始灵珠，推荐先走赤霞山高径。
5. 悬赏栏与任务日志提供首章调查、村民委托及悬赏。五处地区各任选一条路线胜利后带回线索，主动阅读后回村完成本章。悬赏须接取后出发，完成并回村领取2修为；支路调查要求同局取得祭坛奖励再胜利。商人售卖三款剑饰；筑基心劫继续使用原有24修为规则。

现有战斗和地图规则见[正式征程总清单](docs/implementation/正式征程总清单.md)。其中旧版、阵盘试验与历史验收文档只作开发记录，不再代表当前可玩入口。

本地开发接续从[AGENTS.md](AGENTS.md)、[Agent任务索引](docs/agents/README.md)和[本地启动与统一自检](LOCAL_DEVELOPMENT.md)开始。036–050 已按轮次上传并经 [PR #7](https://github.com/DaZhou-ECHO/daoblade-fivefold-path/pull/7) 合入远端 `develop`；`main` 仍停在上一次稳定交付 c3cb5f5，进阶合并与版本标签按[团队维护手册](docs/GitHub团队维护手册.md)由维护者决定。[当前功能进度](docs/implementation/本地功能进度.md)区分已实现与待开发内容，各轮历史限制以对应交接为准。

既有001实现见[历史实施索引](docs/implementation/00-实施索引.md)；此前记录见[v0.3.0设计](docs/v0.3.0设计与实施说明.md)、[v0.3.0测试](docs/v0.3.0测试与交接.md)。未来修改按[初版分方向策划](docs/planning/first-playable/00-初版总纲与阅读入口.md)逐步实施。

## 当前系统

- 师父的八宫说明提供用途、实际按键、限制、获得成长和五类珠槽说明；招式可看短演示与首领差异，装换显示服务端只读预览，保存后可回顾本次变化。
- 五境各有高径、回廊两条路线，共十张可玩地图；每张有独立远中景、剑碑、支路与首领场。
- 固定灵珠按本位宫、功能和等级成长；八宫可拆换，最多出战 **2 个主动技能 + 2 个心法**。
- 师门三系各三级：剑术增加基础劈砍伤害，身法增加速度，护体增加最大生命。每级依次消耗 8、12、16 修为；村中可免费重置并返还花费。
- 正式路线每次胜利得 1 外观券，可购买并装备青岚、赤霞、霜魄剑；外观没有战斗数值。
- 每个账号最多三个独立正式征程，游客为单槽；成长、构筑、外观、剧情与挑战互相隔离。修订号及目录版本防止多窗口覆盖。

## Windows + VS Code 启动

需要 Python 3.11 或更新版本。游戏运行不需要 Node.js；Node.js 仅用于可选的前端自动测试。

在项目根目录打开 VS Code 终端并选择 PowerShell，执行：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# 可选：多人共用时固定会话密钥；未设置会自动生成 instance/session-secret.key
python -m flask --app app run --debug
```

打开 `http://127.0.0.1:5000/`。首次启动会自动创建 `instance/daoblade.sqlite3` 和正式档表；已有旧表只供合档读取，最后一槽确认后删除。数据库文件已被 Git 忽略；合档前建议复制一份本机数据库作离线备份。`SECRET_KEY` 保护登录会话：未设置时服务自动生成 `instance/session-secret.key`（仅本机可读）并在重启后复用，多人共用同一实例时应通过环境变量固定同一个值。

若 PowerShell 不允许激活虚拟环境，可直接运行：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# 可选：多人共用时固定会话密钥；未设置会自动生成 instance/session-secret.key
.\.venv\Scripts\python.exe -m flask --app app run --debug
```

如果已安装其他 Python 3.11+ 版本，可把 `py -3.11` 换成对应解释器命令。端口占用时使用 `--port 5001`。数据库路径可用 `DAOBLADE_DATABASE` 环境变量配置为本机路径；默认无需设置。

## 游玩与账号

行旅入口可选择单槽游客征程。账号拥有三个完全独立存档，设置与账号身份共用。游客档可导入选档页的一个空位，即使账号已有其他征程也不会覆盖；同一来源不能重复复制到多个存档。

在秘境中从主路前进，跳上支路祭坛可获得额外奖励。通关后在师父处调整灵珠与出战栏；挑战中构筑及师门冻结。多个窗口同时操作同一账号时，旧窗口的保存会被拒绝，需重新读取服务存档。游客正式档仅可导入账号的指定空槽，不覆盖已有正式进度。

| 默认按键 | 动作 |
|---|---|
| A / D | 左右移动 |
| W / Space | 跳跃；装备巽卦心法后可二段跳 |
| J | 三段劈砍；完美格挡后按 J 主动反击 |
| K | 正面格挡；合适时机触发完美格挡 |
| L | 消耗剑意发出远程剑气 |
| Q / E | 两个出战卦路的主动技能，各自冷却 |
| Shift | 短闪避 |
| Esc | 暂停、重试、退出或设置按键 |

五行卦宫各有不同主动招式与心法；师门被动对基础动作提供额外成长。

## 开发测试

一条命令跑完本地自检（Python、Node、31 个 JS 语法、美术素材与文档链接）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-project.ps1
```

也可以分别执行：

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp .pytest-tmp-local
node --test
```

`node --test` 会自动发现 `tests/` 下的 22 个 `*.test.cjs`。美术校验需要可选的 Pillow：`.\.venv\Scripts\python.exe -m pip install -r requirements-art.txt`；安装后自检会额外验证 12 帧角色素材与 50 张世界 PNG，Python 用例也从 153 增加到 163。

如果 pytest 无法创建系统临时目录，用 `--basetemp` 指定仓库内的可写目录（如上面示例）即可；这不是游戏运行要求。[CI](.github/workflows/ci.yml) 在 Windows 与 Ubuntu 上跑同一套检查。

## 主要文件

```text
app.py                     Flask 页面、认证、存档 API 与会话密钥解析
journey.py                 正式征程：八宫编译、突破、掉落与事务结算
save_slots.py              账号三存档目录与游客导入归属
shanhe_story.py            山河调查与首章剧情状态
shared_rules.py            读取共享规则、默认档、五行和出战契约
static/data/rules/         规则集JSON（当前legacy-v1，兼容旧玩法）
static/js/rules.js         前端纯计算、进度视图与不可变战斗快照
static/js/game.js          Canvas 战斗、五境、技能、修行和前端交互
static/js/sword-combat.js  八式合招、挑剑/坠剑与蓄力剑气
static/js/shanhe-ui.js     山河画卷、村落与任务界面
tests/                     Python 与 Node 回归测试
tools/check-project.ps1    本地统一自检；check_agent_docs.py 校验交接链接
tools/check_world_art.py   世界 PNG 资源校验（需要 Pillow）
database.py                SQLite 初始化、迁移、按账号存档和版本检查
game_rules.py              灵珠、八卦、出战配置与不可逆选择校验
templates/index.html       主界面和对话框
static/css/game.css        像素国风样式及响应式布局
docs/                      设计、测试、交接和团队维护文档
instance/                  本机数据库与会话密钥，未纳入 Git
```

团队提交和评测流程见 [GitHub 团队维护手册](docs/GitHub团队维护手册.md)。

新工作使用`work/051-工程化收尾`这类补零递增命名，基线与PR依赖见[顺序编号与候选维护](docs/GitHub顺序编号与候选维护.md)。[CI](.github/workflows/ci.yml)已启用：Windows/Ubuntu 双平台跑 Python/Node 回归、全部 JS 语法、Agent 文档链接，另有一个 Pillow 美术资源任务；001 时代的[CI模板](docs/implementation/001-d01-shared-rules/06-ci-workflow.yml.example)只作历史留存。Node仍仅为测试依赖。

`GET /api/rules` 可查询历史规则与契约版本。当前唯一可玩存档为 `/api/journey` 的正式征程；首次升级使用 `/api/journey/unify-preview` 与 `/api/journey/unify-confirm` 完成一次性合档。旧五行与阵盘试验接口在默认应用中已停用；历史规则文档与测试仍保留作回归依据。

## 已知限制

这是单机战斗 + 账号存档的课程原型，不支持联机战斗、云同步、排行或交易。`automation/character-art` 接续分支的主角待机/跑动使用 PNG，战斗使用同一精灵的分层程序姿态和独立本命剑，资源失败时保留 Canvas 回退。战败现有约 1.05 秒完整倒地表现，结束判定后只播放视觉，再显示结算；可直接重新挑战。完整专用动作帧、五行服装剑形与八卦配饰尚未完成，见 [角色美术规范](docs/art/角色与本命剑美术规范.md)、[遗留任务与验收](docs/art/遗留任务与验收.md) 与 [下一轮交接](docs/art/下一轮交接.md)。怪物仍主要由 Canvas 程序绘制。关卡为固定布局，只有首章调查剧情，后续章节、随机地图或更多首领阶段尚未实现。战斗在浏览器内运行，服务器校验存档结构、镶嵌不可逆、修行门槛和并发版本，尚未对每一帧战斗与掉落做服务器权威计算；账号服务应先用于可信的小规模测试环境。

048界面：村落右上为角色摘要，地图/行囊/八宫/任务/设置在画面边缘；演武坪与本命剑台各自处理师门和构筑。战斗状态与技能浮于场景，暂停后可查看完整战况与路线。设置关闭仍留在暂停，明确继续才恢复。

048世界设定与首章脚本见[山河问仙](docs/agents/048-shanhe-journey/WORLD.md)。正式API新增`/api/saves`目录，账号的`/api/journey*`请求必须携带`save_id`；改名/删除同时校验存档修订与目录版本。旧无选档接口仅在显式历史诊断模式保留。
