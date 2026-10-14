"""dnfer_raid.py 纯函数单测（importlib 加载 skill 脚本，零依赖）。"""
import importlib.util
import argparse
import json
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


def test_signup_targets_no_unlocked():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [_raid(1, "2026-09-23T10:00:00", locked=True)]
    assert dnfer_raid._signup_targets(raids, now) == (None, [], "no_target")


def test_signup_targets_single_future_next():
    now = datetime(2026, 9, 23, 10, 0)
    target, cands, reason = dnfer_raid._signup_targets(
        [_raid(1, "2026-09-23T20:00:00")], now)
    assert target["id"] == 1 and cands == [] and reason == "next"


def test_signup_targets_single_today_unlocked():
    now = datetime(2026, 9, 23, 15, 0)
    target, cands, reason = dnfer_raid._signup_targets(
        [_raid(1, "2026-09-23T14:00:00")], now)
    assert target["id"] == 1 and cands == [] and reason == "today_unlocked"


def test_signup_targets_single_stale_past_no_target():
    now = datetime(2026, 9, 23, 10, 0)
    # 唯一未锁定团是非当天的已过团 → 沿用旧逻辑 no_target
    assert dnfer_raid._signup_targets(
        [_raid(1, "2026-09-20T14:00:00")], now) == (None, [], "no_target")


def test_signup_targets_multiple_unlocked_ambiguous_sorted():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [
        _raid(3, "2026-09-26T15:00:00"),
        _raid(1, "2026-09-26T14:00:00"),
        _raid(2, "2026-09-26T14:00:00"),
        _raid(9, "2026-09-27T10:00:00", locked=True),  # 锁定 → 排除
    ]
    target, cands, reason = dnfer_raid._signup_targets(raids, now)
    assert target is None and reason == "ambiguous"
    assert [c["id"] for c in cands] == [1, 2, 3]  # starts_at asc, id 次 key


def test_signup_targets_multiple_but_one_unlocked_auto():
    now = datetime(2026, 9, 23, 10, 0)
    raids = [
        _raid(1, "2026-09-26T14:00:00"),
        _raid(2, "2026-09-27T10:00:00", locked=True),
    ]
    target, cands, reason = dnfer_raid._signup_targets(raids, now)
    assert target["id"] == 1 and cands == [] and reason == "next"


def test_candidate_out_shape_minimal_fixture():
    r = {"id": 3, "name": "周本", "starts_at": "2026-10-18T20:00:00", "locked": False}
    out = dnfer_raid._candidate_out(r)
    assert out["id"] == 3 and out["name"] == "周本"
    assert out["dungeon_name"] is None and out["size"] is None
    assert out["locked"] is False
    assert out["starts_at_local"] == "2026-10-18 20:00 周日"


def test_candidate_out_passes_dungeon_and_size():
    r = {"id": 3, "name": "周本", "dungeon_name": "雾神", "size": 12,
         "locked": False, "starts_at": "2026-10-18T20:00:00"}
    out = dnfer_raid._candidate_out(r)
    assert out["dungeon_name"] == "雾神" and out["size"] == 12


def test_signup_call_nickname_404_falls_back_to_account(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        if body and "nickname" in body:
            return {"ok": False, "status": 404, "error": "账号或昵称不存在"}
        return {"ok": True, "user": {"account": "872557240", "nickname": "帅哥"}}
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    result = dnfer_raid._signup_call(7, "872557240", "signup")
    assert result["ok"] is True
    assert len(calls) == 2
    assert calls[0][1].endswith("/api/public/raids/7/signup")
    assert calls[0][2] == {"nickname": "872557240"}
    assert calls[1][2] == {"account": "872557240"}


def test_signup_call_nickname_400_no_fallback(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        return {"ok": False, "status": 400, "error": "该用户已报名"}
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    result = dnfer_raid._signup_call(7, "872557240", "signup")
    assert result == {"ok": False, "status": 400, "error": "该用户已报名"}
    assert len(calls) == 1
    assert calls[0][2] == {"nickname": "872557240"}


def test_signup_call_unsign_uses_cancel_suffix(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        return {"ok": True, "user": {"account": "longying", "nickname": "龙应藏进云里"}}
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    result = dnfer_raid._signup_call(7, "龙应藏进云里", "unsign")
    assert result["ok"] is True
    assert len(calls) == 1
    assert calls[0][1].endswith("/api/public/raids/7/signup/cancel")
    assert calls[0][2] == {"nickname": "龙应藏进云里"}


def test_cmd_signup_raid_specified(monkeypatch, capsys):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        return {"ok": True,
                "user": {"account": "872557240", "nickname": "帅哥"},
                "raid": {"id": 3, "name": "周本",
                         "starts_at": "2026-10-18T20:00:00"}}
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    args = argparse.Namespace(identifier="872557240", raid_id=3, cancel=False)
    code = dnfer_raid.cmd_signup(args)
    out = json.loads(capsys.readouterr().out)
    assert code == 0 and out["ok"] is True
    assert out["reason"] == "specified"
    assert out["raid"] == {"id": 3, "name": "周本",
                           "starts_at_local": "2026-10-18 20:00 周日"}
    assert len(calls) == 1
    assert calls[0][1].endswith("/api/public/raids/3/signup")


def test_cmd_signup_ambiguous_outputs_candidates(monkeypatch, capsys):
    monkeypatch.setattr(dnfer_raid, "_now_local",
                        lambda: datetime(2026, 9, 23, 10, 0))
    def fake_request(method, url, body=None):
        return [
            {"id": 1, "name": "团1", "dungeon_name": "雾神", "size": 12,
             "locked": False, "starts_at": "2026-10-18T20:00:00"},
            {"id": 2, "name": "团2", "dungeon_name": "雾神", "size": 12,
             "locked": False, "starts_at": "2026-10-18T21:00:00"},
        ]
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    args = argparse.Namespace(identifier="872557240", raid_id=None, cancel=False)
    code = dnfer_raid.cmd_signup(args)
    out = json.loads(capsys.readouterr().out)
    assert code == 0 and out["ok"] is True
    assert out["selected"] is None and out["reason"] == "ambiguous"
    assert [c["id"] for c in out["candidates"]] == [1, 2]
    assert out["candidates"][0]["starts_at_local"] == "2026-10-18 20:00 周日"


def test_cmd_signup_raid_failure_passthrough(monkeypatch, capsys):
    """--raid 指向不存在团：后端 404 透传 _fail（退出 1，stdout ok:false）。
    昵称→账号 404 回退会触发一次冗余二次请求（spec §3.3 已注明无害）。"""
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        return {"ok": False, "status": 404, "error": "攻坚不存在"}
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    args = argparse.Namespace(identifier="872557240", raid_id=3, cancel=False)
    code = dnfer_raid.cmd_signup(args)
    out = json.loads(capsys.readouterr().out)
    assert code == 1
    assert out == {"ok": False, "status": 404, "error": "攻坚不存在"}
    assert len(calls) == 2  # nickname 404 → 回退 account（仍 404）
    assert calls[0][1].endswith("/api/public/raids/3/signup")


def test_cmd_signup_no_target(monkeypatch, capsys):
    """全部团已锁定 → _signup_targets 返回 no_target，stdout selected:null + reason:no_target。"""
    monkeypatch.setattr(dnfer_raid, "_now_local",
                        lambda: datetime(2026, 9, 23, 10, 0))
    def fake_request(method, url, body=None):
        return [{"id": 1, "name": "团1", "locked": True,
                 "starts_at": "2026-09-23T09:00:00"}]
    monkeypatch.setattr(dnfer_raid, "_request", fake_request)
    args = argparse.Namespace(identifier="872557240", raid_id=None, cancel=False)
    code = dnfer_raid.cmd_signup(args)
    out = json.loads(capsys.readouterr().out)
    assert code == 0
    assert out == {"ok": True, "selected": None, "reason": "no_target"}
