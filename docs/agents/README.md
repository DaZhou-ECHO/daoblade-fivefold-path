# Agent 任务索引

| 任务ID | 任务目标 | 状态 | 当前接续Agent | 分支/基线 | 最新交接链接 | 依赖或阻塞 |
|---|---|---|---|---|---|---|
| 014-d06-fire-checkpoint | 火境剑碑会话内续关 | 已完成 | agent-20261021-0031-c8e4 | work/014-d06-fire-checkpoint-local / ba82f57 | [交接](014-d06-fire-checkpoint/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖013；Python48/Node96及真实战败续关通过；刷新恢复后续；仅本地 |
| 013-d06-fire-guidance | 火境分段目标引导 | 已完成 | agent-20261021-0031-c8e4 | work/013-d06-fire-guidance-local / 0954346 | [交接](013-d06-fire-guidance/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖012；Python48/Node91与浏览器通过；仅本地；检查点另续 |
| 012-d01-level-definitions | 旧五境定义与稳定位置引用 | 已完成 | agent-20261021-0031-c8e4 | work/012-d01-level-definitions-local / a0ee0b1 | [交接](012-d01-level-definitions/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地011；五境基线相等，Python48/Node89通过；仅本地 |
| 011-d01-local-checks | 本地入口与可重复自检 | 已完成 | agent-20261021-0031-c8e4 | work/011-d01-local-checks-local / df73305 | [交接](011-d01-local-checks/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地010；统一检查Python48/Node85通过；仅本地 |
| 010-d10-unsynced-battle | 已知失同步时保护正式开战 | 已完成 | agent-20261021-0031-c8e4 | work/010-d10-unsynced-battle-local / 7c25a87 | [交接](010-d10-unsynced-battle/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地009；入口先复现后修复，Node85通过；仅本地 |
| 009-d05-enemy-death-boundary | 燃烧致死同帧停止攻击 | 已完成 | agent-20261021-0031-c8e4 | work/009-d05-enemy-death-boundary-local / 0afa767 | [交接](009-d05-enemy-death-boundary/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地008；先复现后修复，Node84通过；仅本地 |
| 008-d08-combat-feedback | 事件驱动命中与防守文字 | 已完成 | agent-20261021-0031-c8e4 | work/008-d08-combat-feedback-local / cb66145 | [交接](008-d08-combat-feedback/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地007；Node82/Python43及命中/格挡实测通过；仅本地 |
| 007-d09-battle-audio | 五类短音效及有界声音调度 | 已完成 | agent-20261021-0031-c8e4 | work/007-d09-battle-audio-local / bd0ad73 | [交接](007-d09-battle-audio/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地006；Node75/Python43及设置流程通过；仅本地 |
| 006-d01-battle-events | 战斗事实事件及已有声音接入 | 已完成 | agent-20261021-0031-c8e4 | work/006-d01-battle-events-local / aa9509e | [交接](006-d01-battle-events/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地005；Node69/Python43及页面检查通过；仅本地 |
| 005-d02-pointer-lifecycle | D02指针与混合输入释放 | 已完成 | agent-20261021-0031-c8e4 | work/005-d02-pointer-lifecycle-local / 1f2be87 | [交接](005-d02-pointer-lifecycle/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地004；Node64及窄屏拖出松手通过；仅本地 |
| 004-d01-action-state | D01只读动作视图及角色接入 | 已完成 | agent-20261021-0031-c8e4 | work/004-d01-action-state-local / 9033e53 | [交接](004-d01-action-state/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地003；Node61/Python43及浏览器通过；仅本地 |
| 003-d04-airborne-pose | U02跳跃/下落腿部姿态子任务 | 已完成 | agent-20261021-0031-c8e4 | work/003-d04-airborne-pose-local / c3cb5f5 | [交接](003-d04-airborne-pose/agents/agent-20261021-0031-c8e4/HANDOFF.md) | Python43/Node55通过及浏览器实玩；仅本地，通知后才上传 |

2026-10-21 00:31 Asia/Shanghai：远端002仅为Agent治理文档，PR#5开放；本轮不改其文件。003是本地编号，未公开占号，上传前须再检查编号竞争。长期准则来自本工作区根目录AGENTS.md及用户直接提供的同文指令。
