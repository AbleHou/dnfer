"""社区同步任务执行器与职业解析。"""
import asyncio
import json
import re
import urllib.error
import urllib.request
from urllib.parse import quote

from .. import jobs as job_data
from ..config import settings
from ..db import SessionLocal
from ..models import Character, CommunitySyncTask, User
from ..s3 import delete_profile, upload_profile
from ..services.parties import ensure_default_party


class CommunitySyncError(Exception):
    pass


class CommunitySyncRateLimited(CommunitySyncError):
    def __init__(self, retry_after_sec: int):
        self.retry_after_sec = int(retry_after_sec)
        super().__init__(f"换绑限流，请 {self.retry_after_sec} 秒后重试")


def resolve_job(dnfbbz_job: str) -> str | None:
    """dnfbbz 中文职业串 → job_name。去 (男)/(女) 后缀；多候选（男女双版）默认男版；未收录 None。"""
    base = re.sub(r"[（(](男|女)[)）]$", "", dnfbbz_job or "")
    cands: list[tuple[str, str]] = []  # (parent title, job_name)
    for cat in job_data.job_tree():
        for c in cat["children"]:
            if c["title"] == base:
                cands.append((cat["title"], c["name"]))
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0][1]
    male = next((name for parent, name in cands if "(男)" in parent), None)
    return male or cands[0][1]


def _community_request(method: str, path: str, body=None, timeout: int = 20) -> tuple[int, bytes]:
    base = settings.community_sync_base.rstrip("/")
    headers = {"Content-Type": "application/json"} if body is not None else {}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        raise CommunitySyncError(f"同步服务不可用：{e.reason}")


def _detail_text(raw: bytes, status: int) -> str:
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            return d.get("detail") or str(d)
        return str(d)
    except Exception:
        return f"同步服务 HTTP {status}"


def sync_roles(community_id: str) -> list[dict]:
    status, raw = _community_request("POST", "/sync", {"communityId": community_id})
    if status == 429:
        retry = 300
        try:
            retry = int(json.loads(raw).get("retryAfterSec", 300))
        except Exception:
            pass
        raise CommunitySyncRateLimited(retry)
    if status != 200:
        raise CommunitySyncError(_detail_text(raw, status))
    return json.loads(raw).get("roles", [])


def fetch_portrait(community_id: str, role_id: str | None, original_role_id: str | None) -> bytes | None:
    if not original_role_id:
        return None
    path = (f"/portrait?communityId={quote(community_id)}"
            f"&roleId={quote(role_id or '')}&originalRoleId={quote(original_role_id)}")
    status, raw = _community_request("GET", path, timeout=30)
    if status == 404:
        return None
    if status != 200:
        raise CommunitySyncError(_detail_text(raw, status))
    return raw
