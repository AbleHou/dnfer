"""dnf_meeting.py 纯函数单测（importlib 加载 skill 脚本，零依赖）。"""
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dnf-meeting" / "scripts" / "dnf_meeting.py"
_spec = importlib.util.spec_from_file_location("dnf_meeting", _SCRIPT)
dnf_meeting = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dnf_meeting)


def _vote(id_, open_=True):
    return {"id": id_, "title": f"票{id_}", "open": open_, "multi_choice": False}


def test_find_open():
    assert dnf_meeting._find_open([_vote(2), _vote(1, open_=False)])["id"] == 2
    assert dnf_meeting._find_open([_vote(1, open_=False)]) is None
    assert dnf_meeting._find_open([]) is None


def test_match_option_ids():
    options = [{"id": 1, "text": "打"}, {"id": 2, "text": "不打"}]
    ids, missing = dnf_meeting._match_option_ids(options, ["打", "不去"])
    assert ids == [1]
    assert missing == ["不去"]
    ids, missing = dnf_meeting._match_option_ids(options, ["不打"])
    assert ids == [2] and missing == []


def test_shape():
    vote = {"id": 1, "title": "T", "multi_choice": False, "open": True,
            "total_voters": 2, "options": [{"id": 1, "text": "打", "count": 1,
                                            "voters": ["匿名"]}]}
    s = dnf_meeting._shape(vote)
    assert s["title"] == "T" and s["options"][0]["voters"] == ["匿名"]


def test_ballot_call_nickname_404_falls_back_to_account(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        if body and "nickname" in body:
            return {"ok": False, "status": 404, "error": "账号或昵称不存在"}
        return {"ok": True}
    monkeypatch.setattr(dnf_meeting, "_request", fake_request)
    result = dnf_meeting._ballot_call(7, "872557240", [1])
    assert result["ok"] is True
    assert len(calls) == 2
    assert calls[0][1].endswith("/api/public/votes/7/ballots")
    assert calls[0][2] == {"nickname": "872557240", "option_ids": [1]}
    assert calls[1][2] == {"account": "872557240", "option_ids": [1]}


def test_ballot_call_non404_no_fallback(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url, body))
        return {"ok": False, "status": 400, "error": "你已投票"}
    monkeypatch.setattr(dnf_meeting, "_request", fake_request)
    result = dnf_meeting._ballot_call(7, "某人", [1])
    assert result == {"ok": False, "status": 400, "error": "你已投票"}
    assert len(calls) == 1


def test_ballot_call_success_vote_detail_is_success(monkeypatch):
    # 后端成功返回 VoteDetail（无 ok 键）→ 应视为成功（ok 缺省为 None，`resp.get("ok") is False` 为 False）
    def fake_request(method, url, body=None):
        return {"id": 7, "title": "要不要开荒", "open": True}
    monkeypatch.setattr(dnf_meeting, "_request", fake_request)
    result = dnf_meeting._ballot_call(7, "某人", [1])
    assert result.get("ok") is not False
    assert result["id"] == 7
