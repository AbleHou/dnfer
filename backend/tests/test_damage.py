"""compute_combat_power 公式纯函数单测（零依赖，无需 fixtures）。"""
from app.services.damage import compute_combat_power


def test_compute_applies_buffs_and_percent():
    # 三攻=10000 力智=5000 属强=300 攻强=100(100%) 攻强增幅=20(20%) 技攻=50(50%)
    # 副本: 三攻=50000 力智=225000 → 50000*901*2.4*2.2*1.5 / 1e6 = 357
    assert compute_combat_power(10000, 5000, 300, 100, 20, 50) == 357


def test_compute_zero_own_stats_only_buffs():
    # 三攻=40000 力智=220000 → 40000*881*1.05 / 1e6 = 37
    assert compute_combat_power(0, 0, 0, 0, 0, 0) == 37


def test_compute_any_none_returns_none():
    assert compute_combat_power(None, 5000, 300, 100, 20, 50) is None
    assert compute_combat_power(10000, None, 300, 100, 20, 50) is None
    assert compute_combat_power(10000, 5000, 300, 100, None, 50) is None
