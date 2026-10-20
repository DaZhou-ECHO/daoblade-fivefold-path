# 本命剑：八荒五行

**DaoBlade: Fivefold Path** 是一个可在浏览器运行的像素风横版修仙动作游戏。玩家使用相同的移动、跳跃、三段劈砍、格挡、剑气与短闪避；通关五行秘境获得灵珠，再把灵珠永久镶入本命剑的八卦修行图。五行决定招式属性，八卦决定修行方向。

Agent开工先读根目录[AGENTS.md](AGENTS.md)，按规范检查规划、远端PR、留痕和交接。001已通过PR #3集成develop，再通过PR #4进入main；日常从最新确认的develop接续，工作轮次不等于发布版本。本轮实现、契约、测试与交接见[实施索引](docs/implementation/00-实施索引.md)；此前记录见[v0.3.0设计](docs/v0.3.0设计与实施说明.md)、[v0.3.0测试](docs/v0.3.0测试与交接.md)。未来修改按[初版分方向策划](docs/planning/first-playable/00-初版总纲与阅读入口.md)逐步实施。

## 已实现玩法

- 金、木、水、火、土五座手工配置的秘境，各有背景、平台支路、可选祭坛奖励和地面危险区；普通敌人以近战为主，有攻击前摇，另有远程单位和首领。
- 程序绘制的江湖剑客、敌人、剑招轨迹、技能光圈与击中特效；桌面键盘和手机触屏按钮均可操作。
- 五行灵珠拥有一至三阶品质、随机词条和修行经验。品质决定初始词条数量，五行强度按当前珠子等级累计；低阶珠能通过升级补充词条。已镶珠不能取下、替换或移动。
- 八条卦路均可自由搭配五行：第一层学习心法，第二层解锁主动技能，第三层强化该技能。前一层灵珠达到相应等级后才可继续外修。关外可装备 **2 个主动技能 + 2 个心法**。
- 账号注册、登录、退出和每人独立 SQLite 存档。旧游客存档可手动导入尚无存档的账号；多窗口使用存档版本号防止后写覆盖。
- 单机练功场、镶嵌预览、自定义键位、暂停重试、可关闭震屏和可选音效。

## Windows + VS Code 启动

需要 Python 3.11 或更新版本。游戏运行不需要 Node.js；Node.js 仅用于可选的前端自动测试。

在 VS Code 终端选择 PowerShell，执行：

```powershell
cd D:\acode\xju_code\daoblade-fivefold-path
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:SECRET_KEY = '请改成你自己的随机长字符串'
python -m flask --app app run --debug
```

打开 `http://127.0.0.1:5000/`。首次启动会自动创建 `instance/daoblade.sqlite3` 并初始化表；旧 `game_saves` 表会自动补充账号关联和版本列。数据库文件已被 Git 忽略，升级前建议自行复制备份。`SECRET_KEY` 用于保护登录会话；正式多人试用时应设置稳定且私密的值，重启时不要随意更换。

若 PowerShell 不允许激活虚拟环境，可直接运行：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:SECRET_KEY = '请改成你自己的随机长字符串'
.\.venv\Scripts\python.exe -m flask --app app run --debug
```

如果已安装其他 Python 3.11+ 版本，可把 `py -3.11` 换成对应解释器命令。端口占用时使用 `--port 5001`。数据库路径可用 `DAOBLADE_DATABASE` 环境变量配置为本机路径；默认无需设置。

## 游玩与账号

游客可直接试玩，使用本机的单个游客存档。想让多人分别保存进度时，在页面右上角注册账号并登录；账号密码至少 8 位，密码使用哈希存储。已有游客存档的用户，可在**空账号**中点击“导入游客存档”。导入不会覆盖账号原有进度。

在秘境中从主路前进，跳上支路祭坛可获得额外奖励。通关后获得灵珠，在珠匣选珠、到八卦修行图预览，再确认永久镶嵌。主动技能和心法只能在非战斗状态更换。若多个窗口同时操作同一账号，旧窗口的保存会被拒绝并显示“存档未同步”；刷新后读取最新存档，避免静默覆盖。

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

五行主修偏向：**金穿透、木续航、水控制、火爆发、土守御**。副修增加一项轻量效果。未形成明显主副属性时保持基础招式。

## 开发测试

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
node --check static/js/game.js
node --test tests/combat.test.cjs
node --test tests/character-art.test.cjs
node --test tests/defeat.test.cjs
node --test tests/rules.test.cjs
```

在受限环境中如果 pytest 无法创建系统临时目录，可为它指定一个**可写的临时目录**，例如 `--basetemp D:\acode\codex\pytest-daoblade-v03`。这不是游戏运行要求。

## 主要文件

```text
app.py                     Flask 页面、认证和存档 API
shared_rules.py            读取共享规则、默认档、五行和出战契约
static/data/rules/         规则集JSON（当前legacy-v1，兼容旧玩法）
static/js/rules.js         前端纯计算、进度视图与不可变战斗快照
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

`GET /api/rules`可查询公开的当前规则与契约版本。存档API新增`contract`响应字段，原`state`和`revision`兼容；数据库不会因本轮自动迁移为新阵盘。当前仍是旧永久三层玩法；策划中的可拆换测试、完整八卦、本位限制和境界尚未上线。

## 已知限制

这是单机战斗 + 账号存档的课程原型，不支持联机战斗、云同步、排行或交易。`automation/character-art` 接续分支的主角待机/跑动使用 PNG，战斗使用同一精灵的分层程序姿态和独立本命剑，资源失败时保留 Canvas 回退。战败现有约 1.05 秒完整倒地表现，结束判定后只播放视觉，再显示结算；可直接重新挑战。完整专用动作帧、五行服装剑形与八卦配饰尚未完成，见 [角色美术规范](docs/art/角色与本命剑美术规范.md)、[遗留任务与验收](docs/art/遗留任务与验收.md) 与 [下一轮交接](docs/art/下一轮交接.md)。怪物仍主要由 Canvas 程序绘制。关卡为固定布局，没有完整剧情、随机地图或更多首领阶段。战斗在浏览器内运行，服务器校验存档结构、镶嵌不可逆、修行门槛和并发版本，尚未对每一帧战斗与掉落做服务器权威计算；账号服务应先用于可信的小规模测试环境。
