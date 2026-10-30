# 037 内置 imagegen 提示词与制作记录

模式：内置 imagegen。日期：2026-10-22。没有使用CLI回退、API Key或远程运行时依赖。两张生成结果已复制进sources/；图像生成具有随机性，重新调用不保证一致。项目复现使用已保存原图。

## 怪物概念图集

透明背景参数：true。

Use case: stylized-concept game asset atlas. Create a clean 4 column by 5 row evenly spaced sprite atlas on fully transparent RGBA background, 20 separate full-body pixel-art enemies. No text, borders, ground, shadows or labels. Consistent 16-bit Chinese xianxia fantasy side-view sprites facing right. Every figure completely contained in its own equal cell with generous empty margins, foot center aligned in cell. Rows in order: FIRE dark charred copper and vermilion; WOOD jade moss and brown; EARTH ochre sandstone; METAL blue-grey silver; WATER indigo turquoise ice. Columns: ordinary sword guard, special melee puppet with heavy weapon, robed ranged spirit with lantern or talisman, distinct imposing boss with unique silhouette. Fire: charred armored sword soldier, horned charging furnace puppet, fire-talisman court spirit, furnace-core greatsword sovereign. Wood: leaf-armored guard, crawling root creature, mushroom-lantern shaman, tree-crown root-armed forest guardian. Earth: rock armored sentinel, hammer stone puppet, clay throwing idol, massive tablet-weapon mountain guardian. Metal: broken sword automaton, slim silver spear sentinel, floating-blade mechanism, sword-crowned long-blade sovereign. Water: flowing robe swordsman, scaled ice warrior, ice-lantern tide spirit, layered-robed ice-blade pond wraith. Clear readable block pixel clusters and restrained palettes, no anti-alias softness, not horror, no gore. Weapons and accessories complete, feet visible. Each row distinct shape language, not recolors. Large atlas with exactly 20 isolated sprites.

## 五境场景概念图集

透明背景参数：false。

Use case stylized-concept pixel game environment texture atlas. Exactly FIVE equal horizontal panorama strips stacked vertically, each spanning full width with hard straight boundary and no labels or text. Chinese xianxia 16-bit pixel art side-scroller backgrounds, no characters or UI. Strip1 FIRE: distant dark crimson mountain silhouettes and grand Chinese sword-forging furnace court with tiled upturned roofs, copper chimneys, dim ember windows. Strip2 WOOD: misty jade mountains, ancient enormous trees, suspended roots, a tiny ruined Chinese shrine. Strip3 EARTH: ochre mountain gate, layered sandstone cliffs, ruined courtyard and carved stone tablets. Strip4 METAL: blue-grey sword cemetery, distant mining ridge and elegant Chinese smithing corridor with silver glints. Strip5 WATER: indigo cold pond, winding timber walkways, moonlit Chinese pavilion, ice rock silhouettes. Camera is exactly horizontal side-view for 2D platform game. Low contrast background composition, fine readable block pixel clusters, restrained fantasy mysterious atmosphere, rich dark desaturated shadows with sparse warm/cool highlights. Each strip is its own complete continuous 4:1 panorama, horizon around upper third, lower quarter dark unobtrusive ground base. Distinct architecture, atmospheric depth, not identical recolors. No text no watermarks, not horror.

## 结果与加工差异

生成结果的分辨率与全景宽高比并未完全按提示词严格输出。加工工具按实际图像等分、裁切并缩放，不假定生成服务准确输出固定像素尺寸。最终运行时严格校验的是本地整理后的PNG规格。
动作帧来自上述同一身份原画的分层姿态加工；没有声称AI直接输出了780张一致的独立原画。
