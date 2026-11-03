# 042 浏览器与资源证据

2026-11-03 Asia/Shanghai，在本机隔离的 Flask 测试库和 headless Chrome 中实际检查。每次浏览器模式使用 `work/live_smoke_040.py <模式>`；脚本及数据库位于 Git 忽略的 `work/`，执行结束已关闭本轮 Flask 服务。

| 画面 | 证据 | 检查内容 |
|---|---|---|
| 桌面村落 | [截图](desktop-village.png) | 三目标、角色比例、右侧四入口与下一步提示 |
| 窄屏村落 | [截图](mobile-village.png) | 跟随取景、底边四入口、移动/交互键区 |
| 桌面画卷 | [截图](desktop-atlas.png) | 五境地标、火境高径/回廊详情、缩图 |
| 窄屏画卷 | [截图](mobile-atlas.png) | 纵向画卷、五境可见；路线详情可向下滚动 |
| 正式背包 | [截图](formal-bag.png) | 五行分组、珠等级、已装状态与师门入口 |
| 高径入口 | [截图](ridge-entry.png) | 火境高径进入现有战斗场景 |
| 回廊入口 | [截图](hollow-entry.png) | 火境回廊进入现有战斗场景 |

- `interaction042`：实际页面依次打开地图、选五境、Esc 返回、打开背包并进入师门、按 F 交谈、点击传送台选项、打开剑坊；检查窗口焦点及村中操作栏隐藏。结果 `PASS_042_INTERACTION`。
- `return-game042`：新游客槽启动正式路线并退出战斗回村，结果 `PASS_GAME_RETURN`。
- `resume042`：新游客槽启动、退出后从山河图恢复同一未完成挑战，结果 `PASS_042_RESUME`。
- `node --test tests/village.test.cjs tests/journey-home.test.cjs`：7/7，含窄屏取景比例、触控指针按下/松开后移动与师父交互、正式灵珠背包状态。Chrome `--virtual-time-budget` 下合成触控事件没有推进连续动画帧，因此不把浏览器截图称为真实触屏移动验收。
- `tools/check-project.ps1`：Python 129/129、Node 279/279（补加最后一条触控单测前）、全 JS 语法、文档链接与 `git diff --check` 通过；最后再单独运行全套 Node 测试 280/280。`tools/check_world_art.py` 验证 50 PNG，`tools/check_character_art.py` 验证角色与剑资源。

未完成：实体手机触控、从零实际战斗打赢完整高径及回廊；以上两项仍属 041/040 的人工验收，不应把服务端模拟结算或只进入关卡算作通关实玩。
