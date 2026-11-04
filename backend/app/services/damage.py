"""伤害构成公式纯函数：由 6 项玩家属性计算压缩后的「战斗力」。

副本内固定增益（攻坚公共加成）：+40000 三攻、+220000 力智；
最终除以 1e6 压缩为整数战斗力。
"""

DUNGEON_ATK_BASE_BONUS = 40_000
DUNGEON_STR_INT_BONUS = 220_000
COMBAT_POWER_SCALE = 1_000_000


def compute_combat_power(atk_base, str_int, elemental, atk_power,
                         atk_power_amp, skill_atk) -> int | None:
    """任一项为 None → 返回 None（数据缺失不计算）。"""
    if any(v is None for v in (atk_base, str_int, elemental,
                               atk_power, atk_power_amp, skill_atk)):
        return None
    atk = atk_base + DUNGEON_ATK_BASE_BONUS
    si = str_int + DUNGEON_STR_INT_BONUS
    raw = (atk * (1 + si * 0.004)
           * (1.05 + elemental * 0.0045)
           * (1 + (atk_power / 100) * (1 + atk_power_amp / 100))
           * (1 + skill_atk / 100))
    return round(raw / COMBAT_POWER_SCALE)
