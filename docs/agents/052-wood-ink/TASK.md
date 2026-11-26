# 052 木境水墨

- 目标：在只修改木境的前提下，提升高径/回廊的地图层次与材质、木境四个怪物族的轮廓与材质、最终 Boss「古木守灵」技能表现的水墨语言。
- 来源：用户 2026-11-26 提供的《本命剑_木境地图怪物与水墨风格_开源素材增强版_Codex提示词》与《参考.txt》。前者要求只改木境、先审计再实施、共享模块需说明、素材需记录许可；后者给了序列帧、程序化特效与六层打击反馈的技术判断。
- 范围：`static/sprites/world-v1/wood-*.png`、`tools/build_wood_ink_art.py`、`static/js/wood-ink.js`、`tests/wood-ink.test.cjs`、`templates/index.html`（一行脚本）、`docs/art/wood-v1-legacy/`（原始快照）与相关文档。
- 不在本任务内：其他四境地图与怪物、玩家角色与武器、全局战斗数值/AI/碰撞、存档登录地图入口、任务系统、音频；Boss 新增技能或阶段改造；第三方素材接入。
- 验收条件：`tools/check_world_art.py` 与 `pytest`、`node --test` 全绿；清单尺寸/调色板/锚点不变；`git diff` 不出现木境以外的资源或战斗代码；提供优化前后对照帧与许可清单。
- 基线：`develop` 7331dda（051 合并后），分支 `work/052-wood-ink`。
- 依赖：036/037 的世界美术管线与 `world-art-assets.js` 校验；049 的八式合招与 Boss 动作；050 的评审惯例。
- 参与：agent-20261126-2320-w052 独立负责本轮全部修改。
