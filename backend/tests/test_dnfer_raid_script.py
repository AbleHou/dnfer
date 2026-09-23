"""dnfer_raid.py 纯函数单测（importlib 加载 skill 脚本，零依赖）。"""
import importlib.util
from datetime import datetime
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dnfer-raids" / "scripts" / "dnfer_raid.py"
_spec = importlib.util.spec_from_file_location("dnfer_raid", _SCRIPT)
dnfer_raid = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dnfer_raid)


def _raid(id_, starts_at, locked=False):
    return {"id": id_, "name": f"团{id_}", "starts_at": starts_at, "locked": locked}


def test_parse_iso_local_no_offset():
    # Bug 1：starts_at 即本地时间，直接解析展示，不得 +8 变 22:00
    out = dnfer_raid._fmt_local(dnfer_raid._parse_iso("2026-09-26T14:00:00"))
    assert out == "2026-09-26 14:00 周六"


def test_raids_starts_at_local_is_local():
    raids = [_raid(1, "2026-09-26T14:00:00")]
    # 模拟 cmd_raids 的 starts_at_local 计算（本地直读）
    assert dnfer_raid._fmt_local(dnfer_raid._parse_iso(raids[0]["starts_at"])) == "2026-09-26 14:00 周六"


def test_pick_core_range_hits_local_raid_without_offset():
    # Bug 1 回归：14:00 本地场次用本地 13:00-15:00 范围应命中；
    # 若按 +8 偏移解读会变 22:00 而 miss，触发 fallback 回退（真回归点）
    raids = [_raid(1, "2026-09-26T14:00:00")]
    from_dt = datetime(2026, 9, 26, 13, 0)
    to_dt = datetime(2026, 9, 26, 15, 0)
    now = datetime(2026, 9, 26, 12, 0)
    _, meta = dnfer_raid._pick_core(raids, None, None, from_dt, to_dt, now)
    assert meta["fallback"] is False
    assert meta["matches"] == [1]


def test_pick_prefers_unlocked_over_closer_locked():
    now = datetime(2026, 9, 21, 10, 0)  # 周一
    raids = [
        _raid(1, "2026-09-20T14:00:00", locked=True),  # 昨天（周日）已锁定，离当前最近
        _raid(2, "2026-09-26T14:00:00"),               # 下周六未锁定
    ]
    sel, meta = dnfer_raid._pick_core(raids, None, None, None, None, now)
    assert sel["id"] == 2
    assert meta.get("preferred_unlocked") is True


def test_pick_all_locked_takes_closest():
    now = datetime(2026, 9, 21, 10, 0)
    raids = [
        _raid(1, "2026-09-20T14:00:00", locked=True),
        _raid(2, "2026-09-26T14:00:00", locked=True),
    ]
    sel, meta = dnfer_raid._pick_core(raids, None, None, None, None, now)
    assert sel["id"] == 1
    assert "preferred_unlocked" not in meta


def test_pick_time_filter_prefers_unlocked():
    now = datetime(2026, 9, 21, 10, 0)
    raids = [
        _raid(1, "2026-09-26T14:00:00", locked=True),
        _raid(2, "2026-09-26T15:00:00"),
    ]
    sel, meta = dnfer_raid._pick_core(raids, 5, None, None, None, now)  # 周六
    assert sel["id"] == 2


def test_pick_range_no_match_fallback_prefers_unlocked():
    now = datetime(2026, 9, 21, 10, 0)
    raids = [
        _raid(1, "2026-09-20T14:00:00", locked=True),
        _raid(2, "2026-09-26T14:00:00"),
    ]
    sel, meta = dnfer_raid._pick_core(raids, None, None,
                                      datetime(2026, 9, 22, 10, 0),
                                      datetime(2026, 9, 22, 12, 0), now)
    assert meta["fallback"] is True
    assert sel["id"] == 2
    assert meta.get("preferred_unlocked") is True
