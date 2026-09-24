from app.models import Character, User
from app.auth import hash_password
from .helpers import register_user

def _add_char(db, uid, name="剑魂", job="weapon_master", fame=100, class_type="输出"):
    db.add(Character(user_id=uid, name=name, job_name=job, class_type=class_type,
                     fame=fame, simulated_damage=1000, sustained_dps=None, buff_amount=None))
    db.commit()

def test_admin_users_search_and_counts(client, admin_headers, db):
    h, u = register_user(client, "alice", "阿丽")
    _add_char(db, u["id"], fame=100)
    r = client.get("/api/admin/users", headers=admin_headers)
    assert r.status_code == 200
    alice = next(x for x in r.json() if x["username"] == "alice")
    assert alice["character_count"] == 1
    assert alice["is_banned"] is False
    r2 = client.get("/api/admin/users", params={"q": "阿丽"}, headers=admin_headers)
    assert [x["username"] for x in r2.json()] == ["alice"]
    r3 = client.get("/api/admin/users", params={"q": "不存在的人"}, headers=admin_headers)
    assert r3.json() == []
