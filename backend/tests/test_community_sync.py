import asyncio
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.services.community_sync import (CommunitySyncError, CommunitySyncRateLimited,
                                         resolve_job, run_sync_task)
from app.models import Character, CommunitySyncTask
from .helpers import register_user

def test_resolve_job_unique_title():
    assert resolve_job("极诣·剑魂") == "weapon_master"
    assert resolve_job("知源·召唤师") == "summoner"
    assert resolve_job("千魂·狩猎者") == "dragoon"
    assert resolve_job("隐夜·暗星") == "rogue"

def test_resolve_job_gender_split_defaults_male():
    assert resolve_job("重霄·漫游枪手(男)") == "ranger_male"
    assert resolve_job("重霄·漫游枪手(女)") == "ranger_male"
    assert resolve_job("光启·光明骑士(男)") == "crusader_male"
    assert resolve_job("光启·蓝拳圣使(男)") == "infighter"
    assert resolve_job("归元·气功师（女）") == "nenmaster_male"

def test_resolve_job_unknown_returns_none():
    assert resolve_job("不存在的职业") is None
    assert resolve_job("") is None


def _mk_task(db, user_id, community_id="1"):
    t = CommunitySyncTask(user_id=user_id, community_id=community_id, status="pending")
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.id


def _executor(db):
    """把执行器内部的 SessionLocal 指向测试会话（StaticPool 共享连接，避免双会话冲突）。"""
    db.close()  # 关闭当前事务，让执行器接管该会话
    from app.services import community_sync
    community_sync.SessionLocal = lambda: db


def test_run_creates_and_skips(client, db, monkeypatch):
    h, u = register_user(client, "csA", "同步甲")
    roles = [
        {"roleName": "剑魂", "job": "极诣·剑魂", "level": 115, "fame": 133227, "server": "山西",
         "roleId": "1", "originalRoleId": "2"},
        {"roleName": "奶妈", "job": "知源·小魔女", "level": 115, "fame": 129780, "server": "山西",
         "roleId": "3", "originalRoleId": "4"},
        {"roleName": "新职业甲", "job": "未来·新职业", "fame": 1},
    ]
    monkeypatch.setattr("app.services.community_sync.sync_roles", lambda cid: roles)
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "success"
    chars = {c.name: c for c in db.query(Character).filter(Character.user_id == u["id"]).all()}
    assert chars["剑魂"].job_name == "weapon_master"
    assert chars["剑魂"].fame == 133227
    assert chars["奶妈"].job_name == "enchantress"
    assert "新职业甲" not in chars
    skipped = task.result["roles"][2]
    assert skipped["action"] == "skipped" and skipped["reason"] == "职业未收录"
    assert task.result["roles"][0]["action"] == "created"
    assert task.result["roles"][0]["profileImported"] is False


def test_run_updates_fame_keeps_job(client, db, monkeypatch):
    h, u = register_user(client, "csB", "同步乙")
    db.add(Character(user_id=u["id"], name="剑魂", job_name="crusader_female",
                     class_type="辅助", fame=100))  # 预置同名，职业是奶
    db.commit()
    roles = [{"roleName": "剑魂", "job": "极诣·剑魂", "fame": 200}]
    monkeypatch.setattr("app.services.community_sync.sync_roles", lambda cid: roles)
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.job_name == "crusader_female"   # 更新不碰职业
    assert char.fame == 200
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["action"] == "updated"


def test_run_imports_portrait(client, db, monkeypatch):
    h, u = register_user(client, "csC", "同步丙")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "剑魂", "job": "极诣·剑魂", "fame": 1, "originalRoleId": "9"}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait",
                        lambda cid, rid, oid: b"\x89PNG\r\n\x1a\npayload")
    monkeypatch.setattr("app.services.community_sync.upload_profile",
                        lambda uid, cid, ext, data, ct: "https://cdn.example.com/p.png")
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.profile == "https://cdn.example.com/p.png"
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["profileImported"] is True


def test_run_retries_on_rate_limit(client, db, monkeypatch):
    h, u = register_user(client, "csD", "同步丁")
    calls = {"n": 0}
    def flaky(cid):
        calls["n"] += 1
        if calls["n"] == 1:
            raise CommunitySyncRateLimited(1)
        return [{"roleName": "剑魂", "job": "极诣·剑魂", "fame": 1}]
    monkeypatch.setattr("app.services.community_sync.sync_roles", flaky)
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    monkeypatch.setattr(settings, "community_sync_max_retry", 3)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "success" and calls["n"] == 2


def test_run_fails_after_max_retry(client, db, monkeypatch):
    h, u = register_user(client, "csE", "同步戊")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: (_ for _ in ()).throw(CommunitySyncRateLimited(1)))
    monkeypatch.setattr(settings, "community_sync_max_retry", 2)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "failed" and "多次换绑限流" in task.message


def test_run_fails_on_service_error(client, db, monkeypatch):
    h, u = register_user(client, "csF", "同步己")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: (_ for _ in ()).throw(CommunitySyncError("同步服务不可用")))
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "failed" and "同步服务不可用" in task.message


def test_run_fails_on_empty_roles(client, db, monkeypatch):
    h, u = register_user(client, "csF2", "同步空")
    monkeypatch.setattr("app.services.community_sync.sync_roles", lambda cid: [])
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "failed" and "没有角色" in task.message


def test_sync_create_task_and_idempotent(client, db, monkeypatch):
    h, u = register_user(client, "csG", "同步庚")
    async def noop(task_id): pass
    monkeypatch.setattr("app.routers.members.run_sync_task", noop)
    r1 = client.post("/api/me/characters/sync", headers=h, json={"communityId": "329230843"})
    assert r1.status_code == 200
    task = db.query(CommunitySyncTask).filter(CommunitySyncTask.user_id == u["id"]).first()
    assert task is not None and task.status == "pending"
    # 进行中幂等：再发返回同一 taskId
    r2 = client.post("/api/me/characters/sync", headers=h, json={"communityId": "111"})
    assert r2.status_code == 200 and r2.json()["taskId"] == task.id


def test_sync_cooldown_blocks_within_3h(client, db, monkeypatch):
    h, u = register_user(client, "csH", "同步辛")
    async def noop(task_id): pass
    monkeypatch.setattr("app.routers.members.run_sync_task", noop)
    db.add(CommunitySyncTask(user_id=u["id"], community_id="1", status="success"))
    db.commit()
    r = client.post("/api/me/characters/sync", headers=h, json={"communityId": "2"})
    assert r.status_code == 400 and "3 小时" in r.json()["detail"]


def test_sync_allows_after_cooldown(client, db, monkeypatch):
    h, u = register_user(client, "csH2", "同步冷却")
    async def noop(task_id): pass
    monkeypatch.setattr("app.routers.members.run_sync_task", noop)
    # 上次成功同步在 3 小时前 → 冷却已过，允许再次触发
    old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=4)
    db.add(CommunitySyncTask(user_id=u["id"], community_id="1", status="success",
                             created_at=old))
    db.commit()
    r = client.post("/api/me/characters/sync", headers=h, json={"communityId": "2"})
    assert r.status_code == 200


def test_sync_bad_community_id(client, db, monkeypatch):
    h, u = register_user(client, "csI", "同步壬")
    r = client.post("/api/me/characters/sync", headers=h, json={"communityId": "abc"})
    assert r.status_code == 400 and "社区ID格式" in r.json()["detail"]


def test_sync_latest_404_and_visible_only_to_self(client, db):
    h, u = register_user(client, "csJ", "同步癸")
    h2, u2 = register_user(client, "csK", "同步子")
    assert client.get("/api/me/characters/sync/latest", headers=h).status_code == 404
    db.add(CommunitySyncTask(user_id=u2["id"], community_id="1", status="success",
                             result={"roles": []}))
    db.commit()
    assert client.get("/api/me/characters/sync/latest", headers=h).status_code == 404
    r = client.get("/api/me/characters/sync/latest", headers=h2)
    assert r.status_code == 200 and r.json()["status"] == "success"
    assert r.json()["result"] == {"roles": []}
    assert "communityId" in r.json()


def test_run_trims_role_name_whitespace(client, db, monkeypatch):
    h, u = register_user(client, "csTrim", "同步空边")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "  剑魂  ", "job": "极诣·剑魂", "fame": 100}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.name == "剑魂"
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["action"] == "created"
    assert task.result["roles"][0]["roleName"] == "剑魂"


def test_run_trims_fullwidth_space(client, db, monkeypatch):
    h, u = register_user(client, "csTrimFw", "同步全角")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "\u3000剑魂\u3000", "job": "极诣·剑魂", "fame": 100}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    char = db.query(Character).filter(Character.user_id == u["id"]).first()
    assert char.name == "剑魂"


def test_run_skips_empty_name(client, db, monkeypatch):
    h, u = register_user(client, "csTrimEmpty", "同步空名")
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": "   ", "job": "极诣·剑魂", "fame": 100}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    task = db.get(CommunitySyncTask, task_id)
    assert task.status == "success"
    assert task.result["roles"][0]["action"] == "skipped"
    assert task.result["roles"][0]["reason"] == "角色名为空"
    assert db.query(Character).filter(Character.user_id == u["id"]).count() == 0


def test_run_trims_matches_updated(client, db, monkeypatch):
    h, u = register_user(client, "csTrimUpd", "同步更新")
    db.add(Character(user_id=u["id"], name="剑魂", job_name="crusader_female",
                     class_type="辅助", fame=100))
    db.commit()
    monkeypatch.setattr("app.services.community_sync.sync_roles",
                        lambda cid: [{"roleName": " 剑魂 ", "job": "极诣·剑魂", "fame": 200}])
    monkeypatch.setattr("app.services.community_sync.fetch_portrait", lambda cid, rid, oid: None)
    _executor(db)
    task_id = _mk_task(db, u["id"])
    asyncio.run(run_sync_task(task_id))
    db.expire_all()
    chars = db.query(Character).filter(Character.user_id == u["id"]).all()
    assert len(chars) == 1          # 去空后命中既有角色，不重复新建
    assert chars[0].fame == 200
    task = db.get(CommunitySyncTask, task_id)
    assert task.result["roles"][0]["action"] == "updated"
