# 五境与妖傀美术资源 v1

本轮编号037，基线0d59314。资源随仓库保存；游玩不需要外网、API Key、Pillow或Node.js。

## 资源与来源

- [怪物原画](sources/enemy-concepts.png)：内置 imagegen 根据本项目原创设定生成，4列×5行，共20个视觉家族。
- [场景原画](sources/scene-concepts.png)：同一内置工具生成，5条五境全景。
- [实际提示词](PROMPTS.md)：保留两次生成的构图、身份与风格约束。
- 项目未使用现成商业游戏素材，未临摹指定在世画师。
- 画面是原创修仙幻想；宫阙、山门、剑冢等是设计意象，不称道教仪轨或历史复原。本轮没有引入需要考据的具体古籍情节。
- 制作方式为AI辅助原画、Pillow整理、分层姿态加工与程序动画，**不是专业美术师纯手绘逐帧**。地形和统一交互标志由程序绘制为本地PNG。

## 文件组织

游戏资源位于 static/sprites/world-v1/：
- manifest.json：5个场景主题、10张路线场景、20个家族的尺寸、动作行、脚底锚点。
- 每境 guard / special / ranged / boss.png：普通近战、特殊近战、远程、首领。
- 每境 far / mid.png：高径低对比远景和建筑中景，两种视差。
- 每境 hollow-far / hollow-mid.png：回廊独立远景与中景；源图见 sources/routes/。
- 每境 tiles.png：32像素地形模块；第0列实体台面，第1列单向平台及支撑，第2列实体填充。第3列为预留材质变化。
- 每境 props.png：依次为剑碑、祭坛、捷径机关、出口。颜色和外形标志统一，不改变交互位置。

五境材质分别为焦岩裂纹/铜铆、苔木/根桥、砂岩砌块、金属镶板、湿石/冰纹。背景与装饰不参与碰撞，真正落点看亮色台面。

## 精灵规格

普通64×96，宽体96×96，首领128×144；每行最多4帧。RGBA透明背景，普通全图最多32色，首领最多48色。
每家族16段动作、39帧，合计780帧：
- idle 2、walk 4、windup 2、strike 3、recover 2、hurt 1、death 4。
- dash / cast / heavy 各自有2/3/2帧的前摇、攻击、收招。
- 不是每个家族在实际战斗中都会使用所有动作；路由依据现有 attackType/bossMove，不新增攻击。

脚底取原画最低脚部像素的中心；武器和披风不计入身体判定。左右翻转围绕同一脚底世界坐标。待机保留落地靴部，武器独立转动、身体以脚部为轴蓄势和前倾。死亡为压低/消散视觉残留，不保留实体碰撞。

## 复现与校验

在仓库根目录 PowerShell：

```powershell
.venv\Scripts\python.exe -m pip install -r requirements-art.txt
.venv\Scripts\python.exe tools/build_world_art.py --enemy-source docs/art/world-v1/sources/enemy-concepts.png --scene-source docs/art/world-v1/sources/scene-concepts.png
.venv\Scripts\python.exe tools/build_route_scenes.py
.venv\Scripts\python.exe tools/check_world_art.py
```

该命令仅加工已保存原画，不发起AI调用。处理顺序：按等分单元裁切→透明阈值清理→最近邻缩小→脚部锚定→躯干/持械外臂分层→姿态变换→孤立像素清理→全家族限色→PNG导出。原画不被覆盖。
素材版本目录world-v1是美术资源版本，**不是地图或存档版本**。

038 回廊图使用五张仓库内源图，经 `build_route_scenes.py` 按游戏画幅裁切、缩放和限色为 768×144 远景及 768×96 中景。十张地图由 manifest 的 `maps` 键选择；源图再次调用生成工具不保证一致。038 的原始生成提示词未留在当前仓库或交接，不能准确复述；可复现的加工输入是已保存的五张源图。此次没有移动任何碰撞或关卡锚点。

## 检视与限制

运行服务后打开 /static/world-art-preview.html，支持五境、4家族、16动作、左右、逐帧、明暗、锚点/碰撞框、原尺寸和三倍检视。
- 状态进度读取真实 attackTimer；待机/移动和死亡读取已暂停的战斗 elapsed，不用墙钟驱动攻击。
- 旧普通怪的伤害在windup→recover时瞬时发生：用原recover计时前45%表现命中姿态，后55%收招，不制造新的伤害窗口。
- 受击亮闪不遮蔽真实攻击动作；死亡后立即停止原战斗行为，显示最多0.65秒残留。最后一击仍按原结算流程，不为动画延迟结果。
- 当前动作基于分层加工，个别披风/根臂转折仍可继续人工修整，不能当作逐帧原画精修完成。
- 五境代表动作已预览；自动检查覆盖全部780帧，未宣称人工逐帧精修全部780帧。
