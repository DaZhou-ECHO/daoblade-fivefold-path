# Agent 任务索引

| 任务ID | 任务目标 | 状态 | 当前接续Agent | 分支/基线 | 最新交接链接 | 依赖或阻塞 |
|---|---|---|---|---|---|---|
| 006-d01-battle-events | 战斗事实事件及已有声音接入 | 已完成 | agent-20261021-0031-c8e4 | work/006-d01-battle-events-local / aa9509e | [交接](006-d01-battle-events/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地005；Node69/Python43及页面检查通过；仅本地 |
| 005-d02-pointer-lifecycle | D02指针与混合输入释放 | 已完成 | agent-20261021-0031-c8e4 | work/005-d02-pointer-lifecycle-local / 1f2be87 | [交接](005-d02-pointer-lifecycle/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地004；Node64及窄屏拖出松手通过；仅本地 |
| 004-d01-action-state | D01只读动作视图及角色接入 | 已完成 | agent-20261021-0031-c8e4 | work/004-d01-action-state-local / 9033e53 | [交接](004-d01-action-state/agents/agent-20261021-0031-c8e4/HANDOFF.md) | 依赖本地003；Node61/Python43及浏览器通过；仅本地 |
| 003-d04-airborne-pose | U02跳跃/下落腿部姿态子任务 | 已完成 | agent-20261021-0031-c8e4 | work/003-d04-airborne-pose-local / c3cb5f5 | [交接](003-d04-airborne-pose/agents/agent-20261021-0031-c8e4/HANDOFF.md) | Python43/Node55通过及浏览器实玩；仅本地，通知后才上传 |

2026-10-21 00:31 Asia/Shanghai：远端002仅为Agent治理文档，PR#5开放；本轮不改其文件。003是本地编号，未公开占号，上传前须再检查编号竞争。长期准则来自本工作区根目录AGENTS.md及用户直接提供的同文指令。
