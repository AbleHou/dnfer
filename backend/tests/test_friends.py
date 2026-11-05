"""「我的群友」成员角色查询端点（/api/characters/query）测试。"""
from app.models import Character

from .helpers import register_user


def _add_char(db, uid, name="剑魂", job="weapon_master", fame=100, class_type="输出",
              combat_power=None):
    db.add(Character(user_id=uid, name=name, job_name=job, class_type=class_type,
                     fame=fame, simulated_damage=1000, sustained_dps=None, buff_amount=None,
                     combat_power=combat_power))
    db.commit()


def test_friend_query_requires_login(client):
    assert client.get("/api/characters/query").status_code == 401


def test_friend_query_returns_characters_with_nickname(client, db):
    h, u = register_user(client, "f1", "甲")
    _add_char(db, u["id"], name="剑魂", combat_power=1460962)
    r = client.get("/api/characters/query", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["name"] == "剑魂"
    assert item["owner_nickname"] == "甲"
    assert item["combat_power"] == 1460962
    # 成员查询不暴露登录用户名
    assert "owner_username" not in item


def test_friend_query_sees_other_users(client, db):
    h1, u1 = register_user(client, "f2", "甲")
    h2, u2 = register_user(client, "f3", "乙")
    _add_char(db, u1["id"], name="剑魂甲", combat_power=1000)
    _add_char(db, u2["id"], name="剑魂乙", combat_power=2000)
    r = client.get("/api/characters/query", headers=h1)
    assert r.status_code == 200
    names = [i["name"] for i in r.json()["items"]]
    assert set(names) == {"剑魂甲", "剑魂乙"}   # 中文按 Unicode 排序，用集合比较


def test_friend_query_filters_and_sorts(client, db):
    h, u = register_user(client, "f4", "丙")
    _add_char(db, u["id"], name="剑魂", combat_power=1000)
    db.add(Character(user_id=u["id"], name="奶", job_name="crusader_female",
                     class_type="辅助", fame=2, buff_amount=9000, simulated_damage=None))
    db.commit()
    # 按战斗力降序 → 剑魂(1000) 在前（奶 combat_power NULL 排后）
    r = client.get("/api/characters/query", params={"sort": "combat_power", "order": "desc"},
                   headers=h)
    assert r.json()["items"][0]["name"] == "剑魂"
    # 职业过滤
    r = client.get("/api/characters/query", params={"class_type": "辅助"}, headers=h)
    assert [i["name"] for i in r.json()["items"]] == ["奶"]
    # 无效排序
    assert client.get("/api/characters/query", params={"sort": "bogus"}, headers=h).status_code == 400
