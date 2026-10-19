# 本命剑：八荒五行

**DaoBlade: Fivefold Path** 是一款像素风横版修仙动作游戏原型。玩家使用相同的劈砍、格挡和远程剑气进入五行秘境，通过永久镶嵌随机灵珠，在八卦修行图上形成不同的战斗流派。

## 第一版已实现

- Canvas 横版移动、跳跃与镜头跟随
- 劈砍、普通格挡、完美格挡、远程剑气
- 道法技能，任一八卦路线达到第三层后解锁
- 金、木、水、火、土五个主题秘境
- 每个秘境包含两种普通敌人与一个首领
- 五行灵珠随机掉落，一阶、二阶、三阶拥有不同初始词条数量
- 灵珠战斗经验、升级与追加词条
- 八条卦象路线，每条包含入门、化境、道法三层
- 已镶灵珠不能取下、替换或移动，后端会再次校验
- 五行主属性、副属性与基础战斗数值计算
- SQLite 单机存档，网络接口失败时保留浏览器备用存档
- 键盘和触屏操作界面

## 环境要求

- Windows 10/11
- Python 3.11 或更高版本
- 推荐 VS Code 或 Codex

项目已经在 `.venv` 中配置 Python 3.12。若需要重新创建环境，请使用本机 Python 3.11+。

## Windows PowerShell 启动

```powershell
cd D:\acode\xju_code\daoblade-fivefold-path
.\.venv\Scripts\Activate.ps1
python -m flask --app app run --debug
```
python -m pip install -r requirements.txt


浏览器访问：

```text
http://127.0.0.1:5000
```

如果 PowerShell 禁止激活虚拟环境，可以直接运行：

```powershell
.\.venv\Scripts\python.exe -m flask --app app run --debug
```

## 操作

| 按键 | 动作 |
|---|---|
| A / D | 左右移动 |
| W / Space | 跳跃；巽卦化境后可二段跳 |
| J | 劈砍 |
| K | 格挡；受击前短暂按下触发完美格挡 |
| L | 消耗剑意释放远程剑气 |
| Q | 释放已经解锁的道法 |

## 修行规则

1. 玩家初始五行数值均为 1。
2. 秘境结束后获得随机品阶和随机词条的五行珠。
3. 灵珠可以留在珠匣中，镶嵌前能够预览卦位效果。
4. 灵珠必须从八卦中心向外依次镶嵌。
5. 镶嵌确认后不能取下或移动。
6. 已镶灵珠在每次闯关后获得经验，低阶珠也能升级并补充词条。
7. 五行最高值成为主属性，第二高成为副属性；数值并列时显示“未定”。

## 测试

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## 目录

```text
app.py                 Flask 入口和 JSON API
database.py            SQLite 存档
game_rules.py          五行、八卦和不可逆选择校验
templates/index.html   游戏页面
static/css/game.css    像素国风界面
static/js/game.js      Canvas 战斗与修行玩法
tests/                  pytest 规则和 API 测试
docs/                   设计文档
```

## 当前限制

- 第一版采用程序绘制的像素角色和敌人，尚未接入正式逐帧美术资源。
- 目前是单机存档，没有账号、联网排行或玩家交易。
- 关卡采用固定结构与程序化敌人配置，后续可以增加地图机关和更丰富的首领动作。
- 浏览器刷新会结束当前战斗，但已经结算和保存的修行进度不会丢失。

