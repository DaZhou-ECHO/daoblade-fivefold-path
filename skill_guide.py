"""Read-only explanations of the existing journey mechanics; never a learning ledger."""

GUIDE = {
    "qian": {"purpose": "拉开距离，前方直击", "timing": "面对前方较远目标，先对准朝向再施放。", "limit": "直击只检查前方范围，不会追踪或绕过朝向限制。", "effect": "前方远距直击", "mind": "提高基础攻击", "image": "天 · 健", "pair": "kan"},
    "kun": {"purpose": "应对包围，推开近敌", "timing": "敌人从两侧靠近时，用周身攻击争取空间。", "limit": "首领只会小幅位移；此招不回复生命。", "effect": "周身攻击并推开目标", "mind": "提高最大生命", "image": "地 · 顺", "pair": "zhen"},
    "zhen": {"purpose": "打乱普通敌人的进攻", "timing": "观察普通敌人蓄势，在近处施放打断。", "limit": "首领不受同样的蓄势打断。", "effect": "前方直击，打断普通敌人蓄势", "mind": "基础劈砍附加击退", "image": "雷 · 动", "pair": "kun"},
    "xun": {"purpose": "向前穿行，改变站位", "timing": "沿当前高度穿过敌人，先检查落点和地形。", "limit": "地形可能缩短移动；不是向上跳跃，落点仍有危险。", "effect": "向前移动并攻击经过目标", "mind": "提高移动速度", "image": "风 · 入", "pair": "gen"},
    "kan": {"purpose": "减缓敌人，争取行动时间", "timing": "对准逼近的目标，减速后调整站位或衔接另一招。", "limit": "首领减速时间更短；不是精准格挡能力。", "effect": "前方寒流，命中减速", "mind": "缩短主动技能冷却", "image": "水 · 陷", "pair": "qian"},
    "li": {"purpose": "直击后持续灼烧", "timing": "命中后利用灼烧时间移动，或衔接另一主动。", "limit": "再次命中刷新灼烧计时，不叠加独立灼烧层。", "effect": "前方直击，附加灼烧", "mind": "提高主动技能直击伤害", "image": "火 · 丽", "pair": "dui"},
    "gen": {"purpose": "临时护盾，近身应对", "timing": "需要短时保护时施放，同时攻击前方近敌。", "limit": "重复施放不累加护盾；仍需移动和格挡。", "effect": "获得护盾并前方近击", "mind": "提高防御", "image": "山 · 止", "pair": "xun"},
    "dui": {"purpose": "命中回气，维持施招", "timing": "确认目标在前方范围内，命中后回收部分剑意。", "limit": "空放不回气；命中多个目标也只回气一次。", "effect": "前方直击，命中回复剑意", "mind": "提高剑意恢复速度", "image": "泽 · 悦", "pair": "li"},
}

NODE_GUIDE = {
    "core": {"effect": "连接后开通本宫主动；仍须配置到主动栏。", "growth": "每升一级，招式直击参数增加2。"},
    "trace": {"effect": "连接核心后强化本宫招式。", "growth": "1/2/3级分别增加4/5/6直击参数。"},
    "edge": {"effect": "连接纹路后提高伤害，消耗升至16；与流式互斥。", "growth": "1/2/3级分别增加6/8/10直击参数。"},
    "flow": {"effect": "连接纹路后降低消耗，同时减少伤害；与锐式互斥。", "growth": "1/2/3级消耗8/7/6，直击参数修正−3/−2/−1。"},
    "mind": {"effect": "连接核心并放入心法栏后，提供本宫心法效果。", "growth": "随灵珠等级提高；当前效果见心法页。"},
}


def mind_text(palace, level):
    return {
        "qian": f"基础攻击 +{1+level}", "dui": f"剑意恢复 +{.5+.5*level:g}/秒",
        "xun": f"移动速度 +{8+4*level}", "li": f"技能直击 +{1+level}",
        "kan": f"技能冷却 ×{.95-.05*level:.2f}", "gen": f"防御 +{1+level}",
        "kun": f"最大生命 +{10+5*level}", "zhen": f"劈砍击退 {6+4*level}，首领 {1+level}",
    }[palace]


def describe_build(compiled):
    levels = {p: compiled.get("mind_levels", {}).get(p, 1) for p in compiled["minds"]}
    skills = []
    for skill in compiled["skills"]:
        if not skill:
            skills.append(None)
            continue
        item = dict(skill)
        item["damage"] += 1 + levels["li"] if "li" in levels else 0
        item["cooldown"] = round(item["cooldown"] * (.95-.05*levels["kan"] if "kan" in levels else 1), 3)
        item["extra"] = {
            "li": "灼烧3秒，每秒4；再次命中刷新计时", "kan": "减速：普通敌人2秒，首领0.8秒",
            "gen": "护盾12，持续3秒，不累加", "dui": "命中回8剑意，每次施放一次",
            "xun": "向前最多180距离，短时保护0.2秒；地形可能缩短", "kun": "推开：普通敌人70，首领15",
            "zhen": "普通敌人蓄势打断，攻击间隔至少0.6秒；首领不硬控", "qian": "前方远距直击，不追踪",
        }[skill["id"]]
        skills.append(item)
    return {"skills": skills, "minds": [{"id": p, "text": mind_text(p, levels.get(p, 1))} for p in compiled["minds"]],
            "used": compiled["used"], "capacity": compiled["capacity"]}
