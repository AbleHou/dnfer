"""dnfer_api.py 纯函数单测（importlib 加载 skill 脚本，零依赖）。"""
import importlib.util
from pathlib import Path
import urllib.parse

_SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "dnfer-characters" / "scripts" / "dnfer_api.py"
_spec = importlib.util.spec_from_file_location("dnfer_api", _SCRIPT)
dnfer_api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dnfer_api)

DEFAULT_BASE = "http://127.0.0.1:8000"


def test_stats_calls_overview(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append((method, url))
        return {"total_users": 3, "users": [], "class_types": [], "categories": [], "jobs": []}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    assert dnfer_api.cmd_stats() == 0
    assert calls == [("GET", f"{DEFAULT_BASE}/api/public/stats/overview")]


def test_search_builds_query(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append(url)
        return {"items": [], "total": 0}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    dnfer_api.cmd_search(job="weapon_master", category=None,
                         class_type="输出", with_owner=True)
    url = calls[0]
    assert url.startswith(f"{DEFAULT_BASE}/api/public/stats/characters?")
    qs = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert qs["job"] == ["weapon_master"]
    assert qs["class_type"] == ["输出"]
    assert qs["with_owner"] == ["true"]


def test_search_chinese_category_quoted(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append(url)
        return {"items": [], "total": 0}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    dnfer_api.cmd_search(job=None, category="鬼剑士", class_type=None, with_owner=False)
    url = calls[0]
    assert "鬼剑士" in urllib.parse.unquote(url)


def test_search_no_filter_passes_through(monkeypatch):
    calls = []
    def fake_request(method, url, body=None):
        calls.append(url)
        return {"ok": False, "status": 400, "error": "job/category/class_type 至少提供一个"}
    monkeypatch.setattr(dnfer_api, "_request", fake_request)
    assert dnfer_api.cmd_search(None, None, None, False) == 1
    assert calls[0].endswith("/api/public/stats/characters?")
