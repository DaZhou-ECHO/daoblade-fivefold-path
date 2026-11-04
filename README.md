# 本命剑：八荒五行

> 当前开发候选：新手村枢纽与唯一正式征程存档。十张仙侠场景沿用[038 美术资源](docs/art/world-v1/README.md)；旧五行与阵盘试验成果在首次进入新版时预览合并，确认后旧档删除。项目尚未发布此候选。

**DaoBlade: Fivefold Path** 是一个可在浏览器运行的横版修仙动作游戏。角色从青云新手村出发，与山河图、师父和商人交互；挑战五境各两张地图，获得本位灵珠、修为与外观券，配置八宫出战并突破筑基。

## 第一次玩

1. 启动本地服务并打开页面。每次先看到行旅入口：已有登录会话先确认角色并点“继续征程”；也可登录、注册，或明确选择“游客继续”。读取失败时留在入口重试。已有旧档进入村落后先查看合档预览；确认会清除旧版、试验版和正式档的进行中挑战，并删除该槽旧档。
2. 新手村是行程主场景：按 A/D 行走，靠近山河图、师父或商人按 F 交谈，也可点击场景目标。桌面右侧、手机底边有地图、背包、修行和剑坊四个入口；顶部菜单可打开剑诀、按键设置和账号。背包左侧查看角色全貌与已保存出战，右侧筛选持有的灵珠和剑饰。山河画卷中先选五境地标，再点高径或回廊卡上的“进入路线”直接开战；进行中挑战从画卷顶部恢复。功能窗口可按 Esc 或“返回村落”关闭，角色会留在原位置。
3. 关卡内用 Space 跳跃、J 近战、K 格挡、L 剑气、Shift 闪避，Q/E 使用出战技能。前三敌清场后触碰剑碑；祭坛是可选支路。
4. 正式路线胜利获得对应元素灵珠、至少 12 修为和 1 外观券；筑基心劫按独立规则结算。师父窗口先显示剑心环阵：南上北下、东左西右的八宫围绕本命剑。选宫看剑心光路与五形珠槽，点节点装卸核心、纹路、心法、锐式和流式灵珠，点 Q/E/心法符牌设置出战；师门修习与筑基心劫在同一窗口切换。草稿修改须保存后才生效，未保存时不能开战。新档已装好起始灵珠，可先选择火境高径。
5. 商人出售三款只改变剑身与剑光的外观。积累 24 修为后可挑战筑基心劫；成功才扣修为并提高构筑容量。

现有战斗和地图规则见[正式征程总清单](docs/implementation/正式征程总清单.md)。其中旧版、阵盘试验与历史验收文档只作开发记录，不再代表当前可玩入口。

本地开发接续从[AGENTS.md](AGENTS.md)、[Agent任务索引](docs/agents/README.md)和[本地启动与统一自检](LOCAL_DEVELOPMENT.md)开始。历史[审核PR #6](https://github.com/DaZhou-ECHO/daoblade-fivefold-path/pull/6)对应003–035集成，已进入本地develop基线27b7301；[035交接](docs/agents/035-d06-playable-review/agents/agent-20261022-1339-p8a1/HANDOFF.md)保留当时记录。036/037为后续本地候选，本轮未核对远端现状，不代表已发布。审核者先读[审核入口](docs/agents/035-d06-playable-review/REVIEW.md)。[当前功能进度](docs/implementation/本地功能进度.md)区分已实现与待开发内容。

既有001实现见[历史实施索引](docs/implementation/00-实施索引.md)；此前记录见[v0.3.0设计](docs/v0.3.0设计与实施说明.md)、[v0.3.0测试](docs/v0.3.0测试与交接.md)。未来修改按[初版分方向策划](docs/planning/first-playable/00-初版总纲与阅读入口.md)逐步实施。

## 当前系统

- 五境各有高径、回廊两条路线，共十张可玩地图；每张有独立远中景、剑碑、支路与首领场。
- 固定灵珠按本位宫、功能和等级成长；八宫可拆换，最多出战 **2 个主动技能 + 2 个心法**。
- 师门三系各三级：剑术增加基础劈砍伤害，身法增加速度，护体增加最大生命。每级依次消耗 8、12、16 修为；村中可免费重置并返还花费。
- 正式路线每次胜利得 1 外观券，可购买并装备青岚、赤霞、霜魄剑；外观没有战斗数值。
- 账号和游客各自使用一个正式 SQLite 存档。修订号防止多窗口覆盖；旧系统只用于一次性合档，完成后停止运行。

## Windows + VS Code 启动

需要 Python 3.11 或更新版本。游戏运行不需要 Node.js；Node.js 仅用于可选的前端自动测试。

在项目根目录打开 VS Code 终端并选择 PowerShell，执行：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:SECRET_KEY = '请改成你自己的随机长字符串'
python -m flask --app app run --debug
```

打开 `http://127.0.0.1:5000/`。首次启动会自动创建 `instance/daoblade.sqlite3` 和正式档表；已有旧表只供合档读取，最后一槽确认后删除。数据库文件已被 Git 忽略；合档前建议复制一份本机数据库作离线备份。`SECRET_KEY` 用于保护登录会话。

若 PowerShell 不允许激活虚拟环境，可直接运行：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:SECRET_KEY = '请改成你自己的随机长字符串'
.\.venv\Scripts\python.exe -m flask --app app run --debug
```

如果已安装其他 Python 3.11+ 版本，可把 `py -3.11` 换成对应解释器命令。端口占用时使用 `--port 5001`。数据库路径可用 `DAOBLADE_DATABASE` 环境变量配置为本机路径；默认无需设置。

## 游玩与账号

行旅入口可选择“游客继续”，使用本机的单个游客存档。想让多人分别保存进度时，在入口注册或登录账号；账号密码至少 8 位，密码使用哈希存储。退出账号会回到行旅入口。已有游客存档的用户，可在**空账号**中点击“导入游客存档”。导入不会覆盖账号原有进度。

在秘境中从主路前进，跳上支路祭坛可获得额外奖励。通关后在师父处调整灵珠与出战栏；挑战中构筑及师门冻结。多个窗口同时操作同一账号时，旧窗口的保存会被拒绝，需重新读取服务存档。游客正式档可导入无进度账号，不覆盖已有正式进度。

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

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
node --check static/js/game.js
node --test tests/combat.test.cjs
node --test tests/character-art.test.cjs
node --test tests/defeat.test.cjs
node --test tests/rules.test.cjs
node --test tests/action-state.test.cjs
node --test tests/battle-events.test.cjs
node --test tests/battle-audio.test.cjs
node --test tests/combat-feedback.test.cjs
node --test tests/level-definitions.test.cjs
```

在受限环境中如果 pytest 无法创建系统临时目录，可为它指定一个**可写的临时目录**，例如 `--basetemp D:\acode\codex\pytest-daoblade-v03`。这不是游戏运行要求。

## 主要文件

```text
app.py                     Flask 页面、认证和存档 API
shared_rules.py            读取共享规则、默认档、五行和出战契约
static/data/rules/         规则集JSON（当前legacy-v1，兼容旧玩法）
static/js/rules.js         前端纯计算、进度视图与不可变战斗快照
static/js/action-state.js  从战斗实体生成冻结动作视图，供角色渲染消费
static/js/battle-events.js 每局只读战斗事实事件、有限历史与反馈订阅
static/js/battle-audio.js  事件驱动短合成音、并发预算及静音清理
static/js/combat-feedback.js 真实命中/防守文字，数量寿命预算与关闭支持
static/js/level-definitions.js 冻结旧五境布局/敌人配置与稳定位置引用
static/js/level-progress.js 火境分段目标投影
static/js/trial-state.js 剑碑试炼构筑快照序列化与恢复
database.py                SQLite 初始化、迁移、按账号存档和版本检查
game_rules.py              灵珠、八卦、出战配置与不可逆选择校验
templates/index.html       主界面和对话框
static/css/game.css        像素国风样式及响应式布局
static/js/game.js          Canvas 战斗、五境、技能、修行和前端交互
tests/                     Python 与 Node 回归测试
docs/                      设计、测试、交接和团队维护文档
instance/                  本机数据库，未纳入 Git
```

团队提交和评测流程见 [GitHub 团队维护手册](docs/GitHub团队维护手册.md)。

新工作使用`work/001-d01-shared-rules`、`work/002-方向-主题`的补零递增命名，具体基线和PR依赖见[顺序编号与候选维护](docs/GitHub顺序编号与候选维护.md)。[CI模板](docs/implementation/001-d01-shared-rules/06-ci-workflow.yml.example)覆盖Windows/Ubuntu上的规则、战斗、角色、结算与素材；当前令牌缺workflow权限，因此模板尚未放入.github/workflows启用。Node仍仅为测试依赖。

`GET /api/rules` 可查询历史规则与契约版本。当前唯一可玩存档为 `/api/journey` 的正式征程；首次升级使用 `/api/journey/unify-preview` 与 `/api/journey/unify-confirm` 完成一次性合档。旧五行与阵盘试验接口在默认应用中已停用；历史规则文档与测试仍保留作回归依据。

## 已知限制

这是单机战斗 + 账号存档的课程原型，不支持联机战斗、云同步、排行或交易。`automation/character-art` 接续分支的主角待机/跑动使用 PNG，战斗使用同一精灵的分层程序姿态和独立本命剑，资源失败时保留 Canvas 回退。战败现有约 1.05 秒完整倒地表现，结束判定后只播放视觉，再显示结算；可直接重新挑战。完整专用动作帧、五行服装剑形与八卦配饰尚未完成，见 [角色美术规范](docs/art/角色与本命剑美术规范.md)、[遗留任务与验收](docs/art/遗留任务与验收.md) 与 [下一轮交接](docs/art/下一轮交接.md)。怪物仍主要由 Canvas 程序绘制。关卡为固定布局，没有完整剧情、随机地图或更多首领阶段。战斗在浏览器内运行，服务器校验存档结构、镶嵌不可逆、修行门槛和并发版本，尚未对每一帧战斗与掉落做服务器权威计算；账号服务应先用于可信的小规模测试环境。
