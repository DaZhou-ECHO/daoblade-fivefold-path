# ActionState v1 契约

状态：本地已实现，未上传。仅为旧动作的只读渲染视图，不是新的战斗状态机。

- 输入：BattleGame.player或预览虚拟player；读取后构造全新纯数据对象并深冻结。
- 输出：version、action_id、phase、progress、facing、anchor.foot、motion(vx/vy/on_ground)、animation_time、combo、skill_id、feedback(alive/flicker/block_flash/death_drop)。
- progress归一化0..1：slash使用既有slashDuration；qi/dash/hurt沿用旧渲染.25/.2/.2；death沿用1.05。jump/fall按速度展示进展。idle/run/block为loop/hold，无计时推断。
- phase：slash按既有18%/78%有效窗口标windup/active/recovery；其他有限动作visual，death结束complete；jump/fallairborne。phase不改变游戏判定，不能把表现阶段当作服务器权威结果。
- anchor.foot是实体底部中心世界坐标，不包含美术倒地偏移。手/剑握点来自美术manifest和姿态，不属于此适配器的物理坐标。
- 动作优先级完整保留：death > hurt > dash > slash > block > qi > jump/fall > run/idle。
- 不暴露实体x/y/w/h、战斗计时器、HP数值或整个player；渲染只消费适配结果。
- 兼容：Renderer.draw/frame旧签名通过适配器转换；游戏与预览使用drawState/frameFromState显式接口。缺适配器时美术返回false，由游戏原Canvas回退；不悄悄复制第二套计时计算。
- ActionState不是CombatSnapshot（开战配装），不持久化、不影响存档schema。BattleEvent/LevelDefinition未实现。

## 调用入口

- `DaoBladeActions.createActionState(player)` → 新建且深冻结的视图。
- `Renderer.frameFromState(state)` / `drawState(ctx,state,color)` → 姿态与绘制；只支持version=1。
- `Renderer.frame(player)` / `draw(ctx,player,color)` → 保留旧调用方兼容，内部立即适配。
- 页面先加载action-state.js再加载character-art.js，游戏drawPlayer与预览实际创建并传递视图。
- 时长常量仅保留旧渲染语义，未来战斗时长改动需同步适配器；本轮不虚构所有动作已具有权威前摇/有效/恢复契约。
