# 开发交接

## 身份与任务
- 016-d03-array-lab / agent-20261021-0031-c8e4；2026-10-21 10:00 Asia/Shanghai；状态：已完成本首条试验链。
- 来源[015交接](../../../015-d10-checkpoint-save/agents/agent-20261021-0031-c8e4/HANDOFF.md)；[TASK](../../TASK.md)、[CONTRACT](../../CONTRACT.md)。

## 当前代码现场
- 仓库D:/desktop/研/gpt/学习与训练/.reading/daoblade-fivefold-path。
- work/016-d03-array-lab-local，代码基线bce6616，最终提交以git log核对。
- 远端最后核对2026-10-21 00:31，本轮未核对；没有上传/PR/合并/发布，等待用户通知。
- 本轮文件：array_lab.py、共享JSON、JS规则/UI、试验CSS、app/database/game/HTML接入、新增与更新测试、README/功能进度/D03/实施索引、本任务证据；全部本Agent。提交后核对git status，无未知修改。
- 正在运行Flask127.0.0.1:5064，session7844，隔离work/u16-array-lab.sqlite3；有专用本地测试账号，仅测试，不记录凭据。先核对端口，非debug模板修改须重启。
- 浏览器tab6停在测试账号阵盘引爆方案v1，游客聚焰v5；第二冲突窗口tab7已关闭。旧work/u12-visual.sqlite3保留未清理，用户正式存档未使用。

## 已完成与未完成
- array-lab-v1独立规则/独立SQLite表/API，与legacy-v1旧game_saves隔离；游客/账号均revision，CSRF和owner_id避免身份变化写错档。
- 完整八宫方位可见，当前只开放离宫5节点图：核心→留痕→聚焰/引爆/回火，分支互斥。容量3、阶段一、回火锁至阶段二，明确是试验参数。
- 固定样本珠目录；装配只改node→ID引用，拆装不复制/重置等级经验。错误本位/功能/重复/超容量/锁定拒绝；断开的合法节点保留但inactive，拆核心停技、装回恢复。
- 两个同珠数可玩方案：聚焰短距持续；引爆Q加火痕上限3、E消耗。仅技能输出火行，中性基础面板，不把每颗珠词条全局累加。
- 编辑/保存中/已保存/失同步门禁，只有当前草稿已保存才可试招；冲突保留草稿，不自动覆盖。账号reset以epoch忽略迟到请求。
- BattleGame使用冻结试验编译、无经验奖励练功、可见分类累计伤害；暂停重新挑战保留试验快照，退出回阵盘。
- 未完成：正式秘境挑战/掉落/有效珠成长、人物境界突破、其他七宫技能与主要外观阵式。没有把本轮当作完整D03/D10完成。

## 已确认决定与待决定事项
- 用户明确开始落实独立测试档＋一宫两方案；不再优先继续旧玩法边缘改善。
- 五节点/容量3/技能倍率均本轮原型取值，不当成用户已确认的正式境界数值。具体见CONTRACT；基础三招在试验中性，外观未绑定战斗属性。
- 固定样本珠用于组合验收，不从旧永久档复制珠子；正式成长另续。
- 新UI沿用像素国风、炭墨与火色，使用frontend-design技能；无需用户决定，无外部阻塞。

## 验证与证据
- 统一自检Python75、Node115、全部13份JS语法、文档链接和Git空白通过；[完整输出](../../evidence/local-checks.txt)。
- 共享样例empty/focus/burst/detached双端结果一致；非法装配、目录改写、独立表、旧档隔离/错误端点、CSRF、账号切换/relogin/revision覆盖。
- 实际UI：水行核心被拒绝；[聚焰装配](../../evidence/focus-board.png)。未保存试招禁用。
- 实际战斗：[聚焰](../../evidence/focus-combat.png)16直伤+12灼烧；[引爆](../../evidence/burst-combat.png)Q三次36直伤、E42引爆，火痕清零；主属性未定仍能用火行技能。
- [拆核心](../../evidence/core-detached.png)保存后Q无伤且停用，装回同ID再保存；[刷新](../../evidence/reload-burst-board.png)保持3珠/引爆v4。
- [真实双窗口冲突](../../evidence/save-conflict.png)：stale409保留2珠断核心草稿，保存/试招禁用；另窗新配置未被覆盖。
- [真实账号重登](../../evidence/account-relogin.png)：游客聚焰v5，测试账号引爆v1，退出/重登恢复各自配置。暂停重开/退出路径也实际检查；主窗口console无error（冲突窗口的409为预期）。
- 第一轮测试发现木桩continue跳过灼烧，已将试验灼烧更新放在木桩恢复前并以分类伤害验证；不取消旧木桩回血。
- 未做移动端实际操作、正式新构筑完整通关/奖励或平衡测量；不要扩大结论。

## 下一位 Agent 的行动顺序
1. 核对Git和5064存活；当前分支含003–016全部本地成果，不回退旧main。测试数据库不提交。
2. 下一任务优先将试验构筑接入火境挑战，设计array-lab-v1自己的试炼ID/结算/检查点恢复，不把旧active_trial契约强塞新状态。
3. 明确只给开战快照有效出战珠经验、每ID每局一次；隔离测试掉落与旧库存，定义等级/角色阶段与下一阶段容量的可调参数。先写契约和双端样例，再改UI/API。
4. 保留原永久档；新规则战斗需要冻结每技能元素与有效节点。完成火境挑战→试验奖励/成长→关外拆换→保存→重登恢复闭环，再扩其他宫。
5. 可继续补UI窄屏/触控验收、错误网络保存实际UI；不要先投入更多旧玩法小修或全套美术。
- 不应重做003–015；木桩会自动回血，观察累计分类伤害/事实事件而非剩余HP判断灼烧。
- 用户决定：当前无；正式境界名称/长期容量仍非已定，不要把试验容量表写成已确认事实。

## 最小阅读清单
- 根AGENTS/索引/TASK/CONTRACT、[功能进度](../../../../implementation/本地功能进度.md)、D03/专题12。
- array-lab-v1.json、array_lab.py、array-lab-rules.js/UI.js、app.py /api/lab/state与database独立表。
- game.js labCompiled/arrayLabSkill/hitEnemy/试验灼烧；test_array_lab.py、array-lab*.test.cjs和combat/defeat的016回归。
