# 试验挑战与成长服务契约

## 边界与版本
本切片提供array-lab-v1规则集的schema_version=2 / rules_version=2服务与成长编译。名称中的v1是独立试验规则集身份，不等于当前格式号。legacy-v1永久档不变。本切片尚未提供真实挑战按钮，018必须接BattleGame并实际通关；API模拟胜利不能代替实战验收。

旧schema1/rules1试验档仅含原6字段，读取时原样保留珠子与节点并补progress零值/active_trial=null。GET兼容不改写原数据库；下一次成功保存/试炼事务才写v2。升级前已备份隔离测试库work/u16-before-v2-20261021-110408.sqlite3，未提交数据库。

## 成长与编译
共享JSON growth字段定义可调参数：珠上限3、每级20经验、胜利20经验＋12试验修为。只有开战快照effective节点上的珠子ID获得经验，每ID一次；未连接/备用珠不成长。满级XP保持0。失败/放弃不发经验，剑碑失败仍是同一试炼，不新增runs。
等级只影响对应技能：核心每级Q直伤+2，留痕每级Q耗气-1，聚焰每级每跳灼烧+1，引爆每级每层伤害+2。不提升基础攻击/生命/防御，不汇总所有珠词条。Lv1原有两方案保持；JS/Python共享成长样例。
普通POST /api/lab/state只能改装配；珠子XP/等级、progress、active_trial须与服务器已有状态一致。试炼进行中不能修改节点。合法成长只能由服务结算写入。

## 活跃试炼
active_trial字段：id（服务生成）、realm_id=fire、rules_version=2、build（stage/beads/nodes原数据）、effective_bead_ids（按有效节点顺序）、checkpoint（null或swordstone）、claimed_altars（不重复的altar-1/2）。
build冻结开战等级和配置；响应trial_compiled从build计算，不能使用升级后的current compiled回头改正在进行的战斗。

## POST /api/lab/trial
通用请求：action、revision、owner_id；账号需X-CSRF-Token。除start外需trial_id。身份变化409、revision冲突409，非法报告400。
- start：仅允许无活跃试炼且有效核心存在。从服务器已保存构筑生成ID/build/有效经验归属，runs+1。
- checkpoint：defeated_ids须包含enemy-1..3；保存swordstone。客户端仍须验证碑附近地面，服务不假装已运行位置/伤害模拟。
- altar：altar_id为altar-1/2；已领取标记去重保存，恢复后不能再次给回血/额外奖励。
- settle：win为严格bool；defeated_ids为已知6敌的无重复列表，胜利必须全部清除。无检查点失败关闭试炼、零奖励；检查点失败保留同ID/build/祭坛，零奖励；胜利关闭并结算有效珠经验/修为。
- abandon：关闭试炼、零奖励；完整重开须先放弃再start，不复用旧ID。

响应：state、revision、compiled（当前关外构筑）、trial_compiled（活跃试炼冻结构筑或null）、receipt、replayed。
回执：trial_id、outcome（victory/defeat/abandoned）、xp_awards（每ID的amount/level/xp）、spirit。

## 事务与重试
array_lab_saves状态及array_lab_results回执在BEGIN IMMEDIATE事务内同时写入。主键(trial_id,slot)，每个账号/游客作用域隔离。胜利重试即使使用旧revision也读取原回执，不再改变等级、修为或revision；重复旧回执不会清除后来新开的试炼。改变已关闭试炼胜负拒绝。
事务任一步失败回滚两表；测试通过SQLite触发器故意拒绝账本插入，确认状态与经验均未落盘。
客户端仍报告战斗胜负；这不是服务器权威战斗/反作弊，符合可信单机课程展示边界。公开竞技、伪造报告和新随机掉落不在此切片。

## 018接入要求
从响应state.active_trial及trial_compiled启动非木桩火境；单独labRun分支，禁止走旧runs/XP/胜利保存。串行排队checkpoint/altar/settle，成功ACK后更新客户端revision；网络失败保留现场、禁重复奖励和旧档回退。刷新从服务器冻结build与检查点恢复；胜利界面展示服务回执，不能客户端先加经验。失败重试保留同ID，完整新开产生新ID。接实际全流程与断网/冲突验收后，才可称新规则挑战闭环已可玩。
