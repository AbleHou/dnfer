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


def _base_result(role: dict) -> dict:
    return {"roleName": role.get("roleName") or "", "job": role.get("job") or None,
            "level": role.get("level"), "fame": role.get("fame"), "server": role.get("server")}


def _import_profile(db, user: User, char: Character, role: dict, community_id: str) -> bool:
    original_role_id = role.get("originalRoleId")
    if not original_role_id:
        return False
    try:
        data = fetch_portrait(community_id, role.get("roleId"), original_role_id)
        if not data:
            return False
        url = upload_profile(user.id, char.id, "png", data, "image/png")
        if char.profile:
            delete_profile(char.profile)
        char.profile = url
        return True
    except Exception:
        return False


def _process_one(db, user: User, community_id: str, role: dict) -> dict:
    role_name = role.get("roleName") or ""
    fame = role.get("fame")
    job_name = resolve_job(role.get("job") or "")
    if job_name is None:
        return {**_base_result(role), "jobName": None, "action": "skipped",
                "reason": "职业未收录", "characterId": None, "profileImported": False}
    c = db.query(Character).filter(Character.user_id == user.id,
                                   Character.name == role_name).order_by(Character.id).first()
    if c is None:
        c = Character(user_id=user.id, name=role_name, job_name=job_name,
                      class_type=job_data.class_type_for(job_name),
                      fame=fame if fame is not None else 100000,
                      adventure_party_id=ensure_default_party(db, user).id)
        db.add(c)
        db.flush()
        action = "created"
    else:
        if fame is not None:
            c.fame = fame
        action = "updated"
    profile_ok = _import_profile(db, user, c, role, community_id)
    return {**_base_result(role), "jobName": job_name, "action": action,
            "characterId": c.id, "profileImported": profile_ok}


def _process_roles(db, user_id: int, community_id: str, roles: list[dict]) -> list[dict]:
    user = db.get(User, user_id)
    if user is None:
        raise CommunitySyncError("用户不存在")
    results: list[dict] = []
    for role in roles:
        try:
            r = _process_one(db, user, community_id, role)
        except Exception as e:
            r = {**_base_result(role), "jobName": None, "action": "failed",
                 "reason": str(e), "characterId": None, "profileImported": False}
        results.append(r)
        db.commit()  # 逐角色提交，单个失败不丢前面已建角色
    return results


async def run_sync_task(task_id: int) -> None:
    """异步执行器：调 web 服务 → 限流重试 → 逐角色 upsert + 形象 best-effort。"""
    db = SessionLocal()
    try:
        task = db.get(CommunitySyncTask, task_id)
        if task is None:
            return
        task.status = "running"
        db.commit()
        community_id = task.community_id
        max_retry = settings.community_sync_max_retry
        for attempt in range(1, max_retry + 1):
            try:
                roles = await asyncio.to_thread(sync_roles, community_id)
                break
            except CommunitySyncRateLimited as e:
                task.message = f"换绑限流，等待 {e.retry_after_sec} 秒后重试"
                db.commit()
                if attempt >= max_retry:
                    task.status = "failed"
                    task.message = "多次换绑限流，请稍后再试"
                    db.commit()
                    return
                await asyncio.sleep(e.retry_after_sec)
            except CommunitySyncError as e:
                task.status = "failed"
                task.message = str(e)
                db.commit()
                return
        results = _process_roles(db, task.user_id, community_id, roles)
        task.status = "success"
        task.result = {"roles": results}
        db.commit()
    finally:
        db.close()
