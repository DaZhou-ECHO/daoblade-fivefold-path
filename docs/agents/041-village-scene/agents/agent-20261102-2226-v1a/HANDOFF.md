# 开发交接

## 身份与任务
- 任务ID / AgentID：041-village-scene / agent-20261102-2226-v1a。
- 更新时间与时区：2026-11-02 22:51 Asia/Shanghai。
- 接手来源：[040 交接](../../../040-novice-village/agents/agent-20261102-1259-n4v1/HANDOFF.md)。
- 当前目标与验收条件：[041 任务](../../TASK.md)；状态：待验收。代码原型已实现，完整人工通关与实体触控仍待检查。

## 当前代码现场
- 仓库位置：D:/acode/xju_code/daoblade-fivefold-path。
- 分支与代码基线提交：`codex/041-village-scene`，始于 `9bd4802`；实现 `edd41c0`，师门入口修正 `e476707`。
- 远端核对时间及结果：本会话未 fetch；沿用 040 在 2026-11-02 12:59 的历史记录，不能代表当前远端。未推送本分支。
- PR链接及已核实状态：无。
- 未提交文件：无；本交接提交后以 `git status` 复核。
- 正在运行的服务或长任务：无；Chrome 冒烟脚本使用忽略目录 `work/live_smoke_040.py`，独立数据库及截图在 `work/`，运行结束已关闭 Flask。

## 已完成与未完成
- 已完成：村落占主视口，桌面三目标同屏；顶部收为境界/挑战/账号，进度卡与导航从视觉上收起；场景内显示下一步建议。
- 已完成：山河图、师父、商人点击或靠近按 F 先对话再选项；师父区分师门与八宫；窗口覆盖村落，Esc/返回按钮关闭，回到原位置，底层焦点锁定；手机跟随角色并保留三快捷入口。
- 已完成：师门首页展示三系修行和出战摘要，八宫详情折叠；村落 NPC 待机微动与光点、建筑轮廓；正式关卡返回提示统一写“新手村”。没有改关卡、存档结构、商品价格或数值。
- 未完成：从零以真实战斗手动打赢完整关卡再学习一级，以及实体手机触控手势验收；040 的十图和两路线完整实玩仍属其历史待验范围。
- 已知问题与影响：美术仍是主场景原型，NPC 与建筑为 Canvas 形体，未换成最终逐帧美术；不影响交互。桌面浏览器截图验证了布局，未声称所有设备尺寸均实看。

## 已确认决定与待决定事项
- 已确认的规则和来源：用户批准的 041 计划；040 正式征程与师门/商店逻辑继续复用。
- 仍属提案或假设的事项：后续建筑、NPC 精修及完整剧情在单独任务决定。
- 旧文档冲突及本任务采用的依据：040 的网站式首页导航由 041 主场景要求替代；隐藏导航仍留在 DOM 供现有切换代码调用。

## 验证与证据
- 实际命令与结果：`powershell -ExecutionPolicy Bypass -File tools/check-project.ps1`：Python 129、Node 277、JS 语法与 Agent 文档链接检查通过，适用 `edd41c0` 主体代码状态；`./.venv/Scripts/python.exe tools/check_world_art.py`：50 PNG 通过。师门入口末次修正后 `node --test tests/village.test.cjs` 2/2、`node --check static/js/village.js`、`git diff --check` 通过。
- 实际浏览器：本机隔离 Flask + headless Chrome 中，桌面与窄屏截图：[村落桌面](../../evidence/desktop-village.png)、[村落窄屏](../../evidence/mobile-village.png)、[师父对话](../../evidence/master-dialogue.png)、[山河图](../../evidence/atlas-window.png)、[师门](../../evidence/master-window.png)、[商店](../../evidence/shop-window.png)。另验证火境高径与回廊新档启动、战斗退出回村；返回检测 `PASS_GAME_RETURN`，窗口关闭检测 `PASS_RETURN`。
- 师门一级：[浏览器证据](../../evidence/master-learn-level1.png)。隔离新档经服务端测试结算得 12 修为后，在师父窗口点击学习，正式档回读剑术 1 级、余 4 修为，浏览器检测 `PASS_TRAIN`。未把测试结算当成实玩胜利。
- 尚未验证：实体手机触控移动/松手及完整人手战斗通关；十图逐张关卡实玩仍待 040 验收。

## 下一位 Agent 的行动顺序
1. 核对分支、HEAD、未提交文件及远端；阅读本任务证据与 040 交接。
2. 用新游客档真实行走传送台，选火境高径完整通关，返回村中学习剑术一级，再点商人；在实体手机或触控模拟器确认移动、松手、快捷入口及窗口关闭。
3. 若只发现视觉问题，定向调整 `static/css/village.css`、`static/js/village.js` 的场景/提示，不改 `journey.py` 存档或战斗规则；重跑相关 Node 与 Chrome 画面检查。
- 不应重复的工作与已失败方案：不重做 040 师门和商店服务事务；默认沙箱内 headless Chrome 访问 127.0.0.1 会报 `ERR_NETWORK_ACCESS_DENIED`，本会话获批的本机隔离运行可用。
- 需要用户决定的具体问题：无。

## 最小阅读清单
- [041 任务](../../TASK.md)：范围与验收。
- [040 交接](../../../040-novice-village/agents/agent-20261102-1259-n4v1/HANDOFF.md)：正式征程与遗留验收。
- `templates/index.html`、`static/css/village.css`：村落/窗口层级。
- `static/js/village.js`、`static/js/game.js`：交互、取景、切换及返回。
- `static/js/village-progress.js`、`static/js/journey-ui.js`：既有师门商店数据与正式征程操作。
