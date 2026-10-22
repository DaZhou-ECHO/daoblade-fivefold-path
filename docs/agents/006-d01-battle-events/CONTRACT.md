# BattleEvent v1

本地已实现：每局独立createChannel；emit/subscribe/close/recent。事件只记录战斗事实，禁止回调决定伤害、经验和保存。

- 字段：version/id/battle_id/sequence/type/time/source_id/target_id/action_id/attack_id/phase/element/position/amount/critical/periodic/combo。
- type：slash_started、enemy_hit、player_blocked、player_parried、player_hurt、battle_ended。
- time使用当局elapsed秒；id是本页面唯一局ID加局内序号，不用于后端权威结算。
- position为世界坐标复制；其他字段只接受约定标量，不传实体引用。amount是本事件实际伤害；防守事件为格挡前传入伤害，阶段明确为defense。
- recent最多64条，返回冻结副本；close后拒绝派发并释放监听。监听异常隔离并记录计数，不能阻断战斗主链。
- 声音先仅接续旧enemy_hit非持续伤害及player_parried，保留旧音色；后续独立阶段再做挥空/普通格挡/受击区别与并发预算。
- 新模块缺失时游戏仍可运行，事件/声音降级；不复制第二套事件系统。

伤害来源使用局内enemy-N标识；投射物保留发射者，危险区用environment。attack_id/combo仅标识当前近战剑，其他攻击为0，不拿上一剑编号冒充施法编号。battle_ended包含outcome(victory/defeat/abandoned)。关闭有重入保护，销毁旧局不重复发送结束。
