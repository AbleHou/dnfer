from app.services.raid_validator import (check_composition, default_duty,
                                         duty_options, duty_valid_for_class)

def test_duty_options_and_defaults():
    assert set(duty_options("输出")) == {"主C", "辅C", "划水"}
    assert set(duty_options("辅助")) == {"主奶", "太阳奶", "划水"}
    assert default_duty("输出") == "主C"
    assert default_duty("辅助") == "主奶"

def test_duty_valid_for_class():
    assert duty_valid_for_class("主C", "输出")
    assert not duty_valid_for_class("主奶", "输出")
    assert not duty_valid_for_class("主C", "辅助")

def test_composition_valid_full_squad():
    occupied = [("主C", "输出"), ("辅C", "输出"), ("主奶", "辅助"), ("太阳奶", "辅助")]
    assert check_composition(occupied, is_full=True) == []

def test_composition_missing_healer_warns_partial_but_errors_full():
    occupied = [("主C", "输出"), ("辅C", "输出"), ("辅C", "输出"), ("辅C", "输出")]
    warnings = check_composition(occupied, is_full=False)
    assert "缺少辅助" in warnings
    errors = check_composition(occupied, is_full=True)
    assert "缺少辅助" in errors

def test_composition_exempt_with_划水():
    occupied = [("主C", "输出"), ("划水", "输出"), ("划水", "辅助"), ("划水", "辅助")]
    assert check_composition(occupied, is_full=True) == []

def test_composition_missing_mainc():
    occupied = [("辅C", "输出"), ("太阳奶", "辅助"), ("辅C", "输出"), ("太阳奶", "辅助")]
    assert "缺少主C" in check_composition(occupied, is_full=True)

def test_squad_main_healer_limit_is_invariant():
    occupied = [("主奶", "辅助"), ("主奶", "辅助")]
    assert "至多一名主奶" in check_composition(occupied, is_full=False)
