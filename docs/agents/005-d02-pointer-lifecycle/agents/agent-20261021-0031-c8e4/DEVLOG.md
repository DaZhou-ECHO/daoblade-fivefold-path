# 开发日志

## 2026-10-21 00:48 Asia/Shanghai — 开始005
- 目标：指针输入清理，不改数值；基线1f2be87，初始干净。
- 发现：onpointerup仅绑定按钮，未显式捕获/处理lostpointercapture；键盘和按钮共用keys，无法保留另一来源。
- 下一步：先在真实BattleGame测试复现，再加最小输入来源与释放链。

## 2026-10-21 00:52 Asia/Shanghai — 完成与收尾
- 先写三组真实BattleGame输入回归，旧逻辑均失败；加入来源跟踪、显式捕获/窗口兜底、丢失/取消/销毁释放后通过。
- 最终Node64 passed/0 failed，输出evidence/node-tests.txt；game.js语法和diff通过。
- 浏览器工具viewport覆盖未实际改变innerWidth，跨源iframe交互失败；改用临时同源800px iframe成功，真实拖出方向按钮松手后角色停止，后续截图位置稳定。多指和混合源仅自动测试，不冒充真手机验收。
- 临时static/touch-harness-local.html已删除，验收复现源保存在evidence说明；浏览器临时视口已reset。
- 5063静态、5064 Flask均已停止；正式数据未使用。修复本Agent003交接一个相对链接。
- 三阶段均准备本地检查点，无推送/PR/远端合并；下一步建议独立BattleEvent切片，不自动扩展新阵盘。
