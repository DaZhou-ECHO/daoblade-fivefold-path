# Legacy LevelDefinition v1

本地已实现旧布局适配器，不是新关卡流程系统。

- DaoBladeLevels.realms：冻结的五境元数据（背景、敌人目录、首领名）。
- getDefinition(realmId)：冻结定义，含version/id/realm_id、world(width/floor_y)、anchors、platforms、altars、hazards、encounters。
- spawn/boss与enemy-N/altar-N为局内稳定锚点；坐标是世界坐标，y为所站表面。玩家/敌人按自身高度计算实体top；祭坛按28像素高度计算top。
- platforms/hazards提供独立稳定ID。encounters引用anchor_id和敌人目录索引，首领引用boss锚点；运行时创建独立可变实体。
- 定义不包含当局HP、已领取标记或死亡状态；不持久化，不改变存档schema。
- 当前没有实际检查点和出口，定义不伪造这些能力；后续新增单独版本/兼容说明。
