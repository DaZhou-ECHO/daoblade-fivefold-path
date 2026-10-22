# 开发交接

## 身份与任务
- 017-d03-trial-growth / agent-20261021-0031-c8e4；2026-10-21 11:09 Asia/Shanghai；状态已完成服务切片。
- 来源[016交接](../../../016-d03-array-lab/agents/agent-20261021-0031-c8e4/HANDOFF.md)；[TASK](../../TASK.md)、[CONTRACT](../../CONTRACT.md)。

## 当前代码现场
- 仓库D:/desktop/研/gpt/学习与训练/.reading/daoblade-fivefold-path；work/017-d03-trial-growth-local，基线55d0c8d，最终HEAD用git log核对。
- 远端最后核对2026-10-21 00:31，本轮未核对；无上传/PR/发布授权，全部仅本地。
- 本轮文件：array_lab/array_lab_trials.py、app/database、共享试验JSON、JS规则/UI/game快照版本、HTML、回归与共享样例、任务索引和文档证据，均本Agent；提交后检查git status，无未知修改。
- 服务127.0.0.1:5064，Flask session16911，隔离work/u16-array-lab.sqlite3。升级前备份work/u16-before-v2-20261021-110408.sqlite3保留，数据库均不提交。模板修改须重启，先查进程避免重复。
- 浏览器tab6在专用API模拟成长账号的阵盘Lv2引爆，游客/016账号原配置保留；fixture账号标识见evidence，不记录凭据。

## 已完成与未完成
- 试验格式2/规则2，原schema1装配兼容读取、下一次成功写入才升级，不改legacy永久档。
- 独立试炼ID、冻结build与有效珠经验归属；开战/剑碑/祭坛/失败续玩/胜利/放弃接口。
- SQLite结果账本与状态同事务，每ID一次结算；旧revision的相同胜利重试返回旧回执，不重复发奖，也不清后来的新试炼。
- 客户端普通保存不能改XP/等级/修为/试炼字段；进行中不能换节点。账号/CSRF/revision保护保留。
- 仅有效出战珠获得胜利20经验，3级封顶，备用/断连珠无经验；失败/放弃无奖励。每级只改对应技能模块，不加全局面板。
- 双端编译成长一致；当前试招可读取成长珠，显示试验统计，快照标明rules_version。
- 未完成：真实火境挑战按钮与BattleGame labRun、服务队列、检查点/失败/结算UI及真实通关。没有把本服务切片当成完整链路可玩。全宫/突破/新随机珠掉落也仍未完成。

## 已确认决定与待决定事项
- 具体接口/成长值见CONTRACT，全部是原型取值；境界名称/长期容量未定，珠等级3不等于人物境界3。
- 先可靠服务再接实战，紧接018必须回到真实玩法，不能继续仅做服务或边缘美术。
- 胜负仍由客户端报告，结构/事务与去重不等于服务器权威反作弊。
- 无外部阻塞，无需用户决定；不上传要求继续有效。

## 验证与证据
- tools/check-project.ps1：Python88、Node117、13份JS语法、文档链接/空白全部通过；[输出](../../evidence/local-checks.txt)。
- 服务测试：有效/断连/备用珠经验、等级上限、重复胜利、旧回执不清新局、检查点失败不发经验、无检查点失败关闭、祭坛去重、跨账号/CSRF、generic保存拒绝作弊与中途换装。
- 故意SQLite触发器拒绝账本插入，验证经验与主状态一起回滚；原v1档只读不重写且后续保存可升级。
- [旧试验档实际升级视图](../../evidence/v1-save-upgraded-view.png)：原3珠/Lv1/版本1保持。
- [真实服务API模拟报告](../../evidence/live-api-simulation.json)：明确为模拟胜负，不是真实通关。原冻结Lv1，3有效珠Lv2、12修为，重复回执不变、旧永久档未变。
- [成长展示](../../evidence/api-grown-build-view.png)；[实际木桩](../../evidence/api-grown-practice.png)三次Q42直伤＋E48，基础主属性仍未定，console无error。
- 未做新规则真实秘境通关、网络失败UI和检查点恢复UI，证据不能外推。

## 下一位 Agent 的行动顺序
1. 核对Git与5064；当前分支包含003–017，不回退历史main。重用或有序重启测试服务。
2. 建018接真实挑战。array-lab-ui增加挑战/恢复/放弃按钮、串行trial动作队列与epoch；从服务器active_trial.build的trial_compiled启动，不能用当前关外compiled替代。
3. BattleGame新增独立labRun：lab可用于非practice；禁走旧trial/旧XP/runs/legacy保存。新规则全关使用原火境布局与敌人，基础三招中性；出生/恢复位置由本试验检查点决定。
4. 地面剑碑先校验实际前三敌和位置，再调用checkpoint；祭坛每次领取记录；结束用settle回执，等服务ACK后展示奖励。失败剑碑保持同ID并重置后段，完整重开abandon再start。
5. 失败/断网/冲突禁重复提交和发奖、保留可恢复信息；账号切换阻止串档，刷新重新GET恢复。实现后实际打通至少一次完整火境胜利与重登恢复。
6. 隔离API模拟账号是测试fixture，不能把其progress.victories=1当作真实通关证据。下一轮可新建Lv1隔离账号实测。
- 不应重做003–016；木桩自动回血，观察累计分类伤害/事件。服务回执可安全重读，但不同胜负重放被拒绝。
- 需要用户决定：无。新掉落/正式突破仍需独立明确契约，勿混入旧永久档。

## 最小阅读清单
- 根AGENTS/索引/TASK/CONTRACT；D03/D06/D10与016契约。
- array_lab_trials.py/array_lab.py、app.py /api/lab/trial、database账本表；test_array_lab_trials.py。
- array-lab-rules.js/UI.js、game.js lab/构造/start/quit/updateCheckpoint/finish；018从这里接入。
