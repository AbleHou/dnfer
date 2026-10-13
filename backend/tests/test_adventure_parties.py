import pytest
from fastapi import HTTPException
from app.models import Character, User
from app.services.parties import (create_party, delete_party, ensure_default_party,
                                  list_parties, rename_party, resolve_party)

from .helpers import register_user


def _user(db):
    u = User(username="p1", password_hash="x", nickname="阿伟", is_admin=False)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_ensure_default_party_creates_for_partyless_user(db):
    u = _user(db)
    p = ensure_default_party(db, u)
    assert p.name == "阿伟的冒险团"
    assert ensure_default_party(db, u).id == p.id  # 再次调用返回同一团


def test_create_party_unique_per_user(db):
    u = _user(db)
    create_party(db, u, "奶爸团")
    db.commit()
    with pytest.raises(HTTPException):
        create_party(db, u, "奶爸团")  # 重名


def test_delete_party_blocks_nonempty_and_last(db):
    u = _user(db)
    p1 = ensure_default_party(db, u)
    db.commit()
    db.add(Character(user_id=u.id, name="剑魂", job_name="weapon_master",
                     class_type="输出", adventure_party_id=p1.id))
    db.commit()
    with pytest.raises(HTTPException):  # 有角色
        delete_party(db, u, p1.id)
    p2 = create_party(db, u, "二号团")
    db.commit()
    with pytest.raises(HTTPException):  # 非空仍拦截
        delete_party(db, u, p1.id)
    # p2 空团且非最后（p1 还在）→ 可删
    delete_party(db, u, p2.id)
    db.commit()
    assert list_parties(db, u) == [p1]  # 只剩 p1


def test_resolve_party_checks_ownership(db):
    u1, u2 = _user(db), User(username="p2", password_hash="x", nickname="乙", is_admin=False)
    db.add(u2)
    db.commit()
    p1 = ensure_default_party(db, u1)
    db.commit()
    with pytest.raises(HTTPException):
        resolve_party(db, u2, p1.id)  # 非本人团
    assert resolve_party(db, u1, p1.id).id == p1.id
    assert resolve_party(db, u1, None).id == p1.id  # None → 默认团


def test_parties_api_crud(client):
    h, _ = register_user(client, "party2", "阿伟")
    # 初始团
    r = client.get("/api/me/adventure-parties", headers=h)
    assert r.status_code == 200 and len(r.json()) == 1
    assert r.json()[0]["name"] == "阿伟的冒险团"
    pid = r.json()[0]["id"]
    # 创建第二个团
    r = client.post("/api/me/adventure-parties", headers=h, json={"name": "奶爸团"})
    assert r.status_code == 200 and r.json()["name"] == "奶爸团"
    assert r.json()["character_count"] == 0
    pid2 = r.json()["id"]
    # 重名 400
    assert client.post("/api/me/adventure-parties", headers=h,
                       json={"name": "奶爸团"}).status_code == 400
    # 改名
    r = client.put(f"/api/me/adventure-parties/{pid2}", headers=h, json={"name": "奶妈团"})
    assert r.status_code == 200 and r.json()["name"] == "奶妈团"
    # 删除：空团且非最后 → 成功；删到只剩一个 → 400
    assert client.delete(f"/api/me/adventure-parties/{pid2}", headers=h).status_code == 200
    assert client.delete(f"/api/me/adventure-parties/{pid}", headers=h).status_code == 400


def test_parties_api_ownership(client):
    h1, _ = register_user(client, "p3", "甲")
    h2, _ = register_user(client, "p4", "乙")
    pid = client.get("/api/me/adventure-parties", headers=h1).json()[0]["id"]
    assert client.put(f"/api/me/adventure-parties/{pid}", headers=h2,
                      json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/me/adventure-parties/{pid}", headers=h2).status_code == 404
