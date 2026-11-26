# 开发日志 · agent-20261126-2320-w052

## 2026-11-26 23:14 Asia/Shanghai — 接手、拉取与审计

- 目标：按用户新给的两份提示词接手项目，先确认木境真实状态再动手。
- 基线：`git fetch` 后 `origin/develop` = 7331dda（051 合并提交），工作区干净；用户说“今晚 12:00 会上传一版”，拉取时远端没有新提交，按当前 develop 继续。
- 操作与文件：只读。阅读 `docs/agents/README.md`、050/051 交接、`README.md`、`world-art-assets.js`、`scene-art.js`、`enemy-art.js`、`level-definitions.js`（木境 bg/敌人/机关）、`tools/build_world_art.py`、`manifest.json`，并把木境资源导出为对照图逐张看。
- 决定与依据：确认是真的 Canvas + Flask 项目，美术由 `tools/build_world_art.py` 从概念图程序化生成；木境问题集中在（a）远中景同源、视差读不出层，（b）地形/道具三色平涂、与背景质感断层，（c）怪物荧光描边、深绿天幕下轮廓发闷，（d）Boss 无风格化表现。据此定 052：只替换木境资源 + 新增木境表现层，不碰战斗代码。
- 验证：`pytest` 163、`node --test` 323 为基线；`tools/check_world_art.py` PASS。
- 未完成或阻塞：无。
- 下一步：写木境专用重建工具，先做场景与地形。

## 2026-11-26 23:30 Asia/Shanghai — 美术重建与两次返工

- 目标：把木境资源改成水墨语言，同时保证尺寸、调色板、帧时序不变。
- 基线：工作区新增 `tools/build_wood_ink_art.py`；原始资源先备份到 `work/wood-orig`。
- 操作与文件：新工具按“原图 + 增量层”处理远/中景（墨山脊、纸色天光、湿边薄雾、纸纹）；重绘 `wood-tiles`（苔冠/树皮/根系）与 `wood-props`（纸白剑碑 + 朱印、树瘤祭坛、木质机关、带雾隙山门）；对四个怪物族做墨线轮廓、左上纸白受光、苔青换色、Boss 关键姿态加权变形。
- 决定与依据：
  - 第一次尝试整图重映射到纸墨色阶，画面被洗成竖条纹、塔与巨树几乎消失 → 放弃全局重映射。
  - 第二次叠加过重雾与笔触，怪物与平台对比反而更差 → 改为“轻水墨”，只保留一道淡墨山脊、两道薄雾、3% 纸纹。
  - 发现重复运行会在已处理结果上继续叠加（远景均值被推到 117），改为从 `docs/art/wood-v1-legacy/` 快照读取输入，工具变成幂等；该快照同时是回滚备份。
- 验证：每次改完都用同一套绘制参数渲染 960×540 合成帧，与原始资源同帧对照；`check_world_art.py` 持续 PASS。
- 未完成或阻塞：怪物仍是变形而非手绘关键帧，已在文档标为限制。
- 下一步：补 Boss 技能的水墨表现层。

## 2026-11-26 23:52 Asia/Shanghai — 木境表现层与回归

- 目标：给 Boss 技能加水墨语言，同时不碰战斗规则。
- 基线：木境资源替换完成，`check_world_art.py` PASS。
- 操作与文件：新增 `static/js/wood-ink.js`：包装 `DaoBladeSceneArt.Renderer` 与 `DaoBladeEnemyArt.Renderer`，木境追加地平墨气、暗角与浮墨点；Boss 在 windup/strike/hurt 追加墨池、笔锋与溅墨。`templates/index.html` 在 `scene-art.js` 后加载该脚本（一行）。新增 `tests/wood-ink.test.cjs` 6 条。
- 决定与依据：现有渲染管线没有“按五行挂后处理”的扩展点，改 `game.js` 风险更大；用子类包装是唯一只动表现层的做法，且异常可自禁用。笔触只做方向提示，明确不宣称攻击范围，预警仍以原黄色标记为准。
- 验证：`node --test tests/wood-ink.test.cjs` 6 pass；`node --test` 323 pass；`pytest` 163 passed；`node --check static/js/wood-ink.js` 通过。
- 未完成或阻塞：浏览器实机与实体设备未验。
- 下一步：整理证据与文档，提交推送并开 PR。

## 2026-11-27 00:10 Asia/Shanghai — 文档、证据与上传

- 目标：把改动、许可与限制写清楚，按仓库规则上传。
- 基线：木境资源 + 表现层完成，全部自动检查通过。
- 操作与文件：新增 `docs/implementation/052-木境水墨.md`、`docs/art/木境怪物与Boss美术优化.md`、`docs/art/木境开源素材与许可清单.md`、`docs/agents/052-wood-ink/evidence/验收记录.md` 与四张对照图；更新 Agent 索引与功能进度；提交 `work/052-wood-ink` 并开 PR。
- 决定与依据：证据用离线合成帧并明确标注不是浏览器截图；第三方素材全部“仅参考”，不引入许可义务。
- 验证：`tools/check_agent_docs.py`、`tools/check_world_art.py`、`node --test`、`pytest` 全部通过；CI 结果见 PR。
- 未完成或阻塞：无代码层阻塞；真人实玩与实体设备仍挂起。
- 下一步：合并后从更新后的 develop 拉 `work/053`，优先做浏览器实机验收或怪物手绘关键帧。

## 2026-11-27 00:25 Asia/Shanghai — 补浏览器验收

- 目标：用户要求“再试试”，把上一轮标为未完成的浏览器验证补上。
- 基线：`develop` 1cda34a（052 已合并）。
- 操作与文件：先试完整 UI 流程（注册→选档→山河图→木境）的 headless 驱动，遇到两个坑：旧 `chrome-profile` 里的 `DevToolsActivePort` 指向已退出实例、以及重复运行留下的同名账号导致注册 409；前者改为每次新建 profile，后者改为按时间戳生成账号。整局流程驱动仍不稳定，改为交付**可复现的浏览器渲染检查**：`tools/check_wood_ink_browser.py` + `tools/wood-ink-cdp.cjs` 打开 `/static/world-art-preview.html`（加载的正是游戏同一批脚本与 PNG），等待资源就绪后截取木境高径、回廊与 Boss 起手帧。
- 决定与依据：预览页用的是生产环境的 `world-art-assets.js`/`scene-art.js`/`enemy-art.js` 与同一批资源，足以证明“浏览器能加载并渲染新素材”；不把预览截图说成关卡实玩。
- 同时修正：3 倍检视下木灵刀卫仍有黄绿描边，把苔色目标调冷（MOSS 92/118/84、SAGE 148/168/130）、叶簇混合从 0.46 提到 0.72、去光只保留顶部冷边、树皮去饱和成墨褐；黄绿像素占比 8.7%→4.0%。
- 验证：`check_wood_ink_browser.py` 报告 `本地资源 50/50 · 异常 0`；`check_world_art.py` PASS；`node --test` 323 pass；`pytest` 163 passed。
- 未完成或阻塞：登录后的整局实玩自动化仍不稳定，未纳入工具。
- 下一步：提交这部分与证据，推送并合并；整局实玩留给人工。
