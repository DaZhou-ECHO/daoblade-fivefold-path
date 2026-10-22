# GitHub顺序编号与候选维护

适用：2026-10-20起的初版分方向工作。补充旧《GitHub团队维护手册》；本文件中的当前候选与编号规则优先，旧检查记录保留为历史。

## 2026-10-20接续更正（002）

根目录[AGENTS.md](../AGENTS.md)为Agent开工入口；自主选题、留痕、额度接续及经授权的develop集成以该规范为准。成员无需领取任务，但须公开范围、检查开放PR、协调公共文件与编号。

001通过[PR #3](https://github.com/DaZhou-ECHO/daoblade-fivefold-path/pull/3)进入develop，再经[PR #4](https://github.com/DaZhou-ECHO/daoblade-fivefold-path/pull/4)进入main；PR #2关闭未合并。下文“当前实际基线”为001当时历史，不再作为新轮次基线。独立新工作从最新确认的origin/develop开始。

旧文“不自动合并主干”为001当时权限范围。负责人现已授权主维护Agent检查通过后串行集成develop；main、正式标签和发布仍由负责人决定。本次不授权修改保护、凭据或CI权限。

## 命名约定

| 对象 | 格式 | 本轮示例 |
|---|---|---|
| 工作分支 | work/NNN-dXX-short-topic | work/001-d01-shared-rules |
| 实施目录 | docs/implementation/NNN-dXX-short-topic/ | 001-d01-shared-rules |
| 文档顺序 | 00实施、01契约、02测试、03交接 | 与代码按同一轮次追踪 |
| 提交 | type(scope): NNN concrete change | refactor(rules): 001 share legacy rules and freeze battle snapshots |
| PR标题 | [NNN][DXX] 具体目标 | [001][D01] 共享规则与不可变战斗快照 |

编号全项目统一递增，不是D01、D02分别从001重开。负责人先看实施索引及远端已有work/NNN-*，再分配下一号。若两人并行，先分配不同编号、明确方向和公共接口负责人。

## 当前实际基线

本轮从automation/character-art的0edf713接续，因为它包含此前已工作的角色/战斗与结算成果；当前develop尚未集成这些候选。不能从旧develop开分支后覆盖或丢掉完整候选代码。

本轮PR目标采用automation/character-art，只比较001的变化。它的合并属于负责人后续决策；向develop集成完整候选仍需单独审查其依赖，不自动执行。

下一轮优先从已确认集成基线开新分支。若负责人要求在未合并的001上接续，则新分支从001开始，并明确PR依赖001、先对001比较；不能把分支号码误当成自动依赖或正式版本。

## 日常安全步骤

先检查git status和本轮交接，再fetch并核对本地/远端SHA。只普通推送自己的候选分支；不自动强推、重置、变基、合并主干或发布标签。出现人工修改、远端领先或分叉时保留现场，先协调，不把文档里的旧SHA当成回退目标。

按审查后的文件清单git add，避免把数据库、work临时文件、密钥和个人修改纳入提交。推送后用git ls-remote核对分支SHA，而不只看push命令是否返回成功。

## 审查与自动检查

PR模板记录编号、基线、实际行为、测试、兼容和下一轮入口。001已准备覆盖Windows/Ubuntu的Python、Node及素材检查模板，但当前Git令牌缺workflow权限，GitHub拒绝创建工作流的推送。CI以不执行的06-ci-workflow.yml.example交付，远端未启用；具备既有工作流维护权限的负责人以后可审阅并放入.github/workflows/ci.yml。没有扩大令牌权限。只有实际远程运行成功才能写“CI通过”，本地全绿或模板不等同远端通过。

每个PR的代码、测试、计划依据与交接放在一起审查；main/develop保护规则、成员权限和正式发布由负责人管理，本轮不变更仓库安全策略。工作编号001不自动创建v1.0.0或任何正式标签。

## 历史记录的保留

Git提交保留逐次变化，实施索引提供阅读入口。尚未验收不要删除候选；若要删除已合并短期分支且需要保留原始实验提交，先记录PR和最终源SHA，必要时建立负责人认可的归档引用。Squash只保留集成结果，不等于保留每个原始实验提交；是否压缩应由团队按审查需要决定。

不每天复制整个项目成新文件夹，也不为每次提交创建Release。正式版本使用独立语义化版本及标签，开发轮次使用补零编号，两者分别维护。
