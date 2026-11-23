# 051 工程化收尾与健壮性

- 目标：接手 050 合并后的开发分支，销掉长期挂起的工程化待办：启用仓库 CI、把会话密钥与 API 错误处理做完、补齐美术校验入口，并让文档与当前远端状态一致。
- 来源：用户在 2026-11-23 指示“接手里面的待办事项，把待完善的地方进行完善，然后再上传”。基线 `develop` = `43afe4d`（050 的 PR #7 已合入）。
- 范围：`.github/workflows/ci.yml`、`app.py`（密钥解析、HTTP 错误处理器、健康检查）、`tests/test_app_hardening.py`、`tools/check-project.ps1`、`.gitignore`、README/LOCAL_DEVELOPMENT 与本文档、051 任务与交接记录。
- 不在本任务内：玩法数值、关卡与美术资源改动；`main` 合并与版本标签；真人试玩、实体手机与听觉验收；U04–U06 美术遗留项（需要负责人决策或美术产出）。
- 验收条件：统一自检 `tools/check-project.ps1` 通过；Python 163 项、Node 317 项、31 个 `static/js/*.js` 语法、50 张世界 PNG、12 帧角色素材与 Agent 文档链接全部通过；CI 在 push 后于 GitHub 上实际跑绿。
- 前置依赖：050 [交接](../050-integrate-036-049/agents/agent-20261116-1343-i050/HANDOFF.md) 与 [评审清单](../050-integrate-036-049/REVIEW.md)；[遗留任务与验收](../../art/遗留任务与验收.md) 说明美术项状态。
- 参与：agent-20261123-1900-h051 独立负责本轮全部修改。
