# 开发日志

## 2026-10-21 01:44 Asia/Shanghai — 接手与存档调查
- 目标：把会话剑碑接入现有SQLite存档和账号隔离。
- 基线：041c697，分支work/015-d10-checkpoint-save-local，开始时干净。
- 操作与文件：阅读game_rules/shared_rules、前端saveState/loadState及登录退出、API/revision测试；核对5064存活。
- 决定与依据：只增加可选active_trial版本字段，构筑原数据经现有校验重建快照，不能直接信任序列化stats。
- 验证：本轮尚未执行新检查；历史014为48/96。
- 未完成或阻塞：无外部阻塞。
- 下一步：实现双端存档契约和恢复生命周期。

## 2026-10-21 01:56 Asia/Shanghai — 持久化闭环与实测
- 目标：完成剑碑离散保存、刷新恢复与退出边界。
- 基线：041c697后的015工作树。
- 操作与文件：新增trial-state.js、game_rules.py active_trial校验、洞府恢复入口、激活/祭坛/胜利/放弃保存；退出账号清理已结束实例；新增双端与实际保存队列测试。接口详见../../CONTRACT.md。
- 决定与依据：失败返回洞府保留检查点；明确放弃和完整重开清除，避免返回误丢进度。主存档失败阻止游客正式新开，浏览器备份配额错误不应阻止SQLite保存。
- 验证：统一自检Python61、Node105、11份JS语法、文档链接与diff通过，见../../evidence/local-checks.txt。浏览器真实清前三敌，7HP到碑恢复97并显示已保存；刷新出现恢复按钮，继续到碑97HP/3敌；runs仍6。见checkpoint-saved/reload-entry/reload-restored截图。
- 决定与依据：试玩复现Esc关闭结果后困在死亡画面，增加cancel preventDefault；实际按Esc后结果仍可操作，见result-escape-safe.png。失败后返回保留是此后根据退出语义调整的最终行为，由Node回归验证，未再完整重打浏览器复核该按钮变化。
- 未完成或阻塞：后半段实际尝试仍失败，尚无本次完整胜利实测；真实浏览器账号重登未做，API覆盖账号隔离/revision冲突，Node覆盖logout旧实例隔离。无外部阻塞。
- 下一步：本地提交后继续火境完整通关验收，观察新手空珠构筑面对后段远程＋突进的难度与预警；不凭一次失败直接削弱数值。
