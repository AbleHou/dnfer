from app.models import Character, User
from app.auth import hash_password
from .helpers import make_raid, register_user

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

def test_query_characters_filters_sorts_paginates(client, admin_headers, db):
    _, u1 = register_user(client, "p1", "玩家一")
    _, u2 = register_user(client, "p2", "玩家二")
    _add_char(db, u1["id"], name="剑魂甲", job="weapon_master", fame=100, class_type="输出")
    _add_char(db, u1["id"], name="奶妈乙", job="crusader_female", fame=200, class_type="辅助")
    db.add(Character(user_id=u2["id"], name="剑魂丙", job_name="weapon_master",
                     class_type="输出", fame=300, simulated_damage=999,
                     sustained_dps=None, buff_amount=None))
    db.commit()

    # 筛选：职业
    r = client.get("/api/admin/characters/query",
                   params={"job_name": "weapon_master"}, headers=admin_headers)
    assert r.status_code == 200
    assert [i["name"] for i in r.json()["items"]] == ["剑魂丙", "剑魂甲"]  # fame desc
    # 筛选：输出/辅助
    r = client.get("/api/admin/characters/query",
                   params={"class_type": "辅助"}, headers=admin_headers)
    assert [i["name"] for i in r.json()["items"]] == ["奶妈乙"]
    # 筛选：角色名关键词
    r = client.get("/api/admin/characters/query",
                   params={"keyword": "剑魂"}, headers=admin_headers)
    assert r.json()["total"] == 2
    # 筛选：归属玩家
    r = client.get("/api/admin/characters/query",
                   params={"owner": "玩家二"}, headers=admin_headers)
    assert [i["name"] for i in r.json()["items"]] == ["剑魂丙"]
    assert r.json()["items"][0]["owner_nickname"] == "玩家二"
    # 新增一个 buff_amount 有值的角色（放在排序断言之前，不影响前面筛选断言的 3 个角色）
    db.add(Character(user_id=u1["id"], name="奶妈丁", job_name="crusader_female",
                     class_type="辅助", fame=50, simulated_damage=None,
                     sustained_dps=None, buff_amount=500))
    db.commit()
    # 排序：增益量 asc（奶妈丁有值排最前；其余 buff_amount NULL 经 NULLS LAST 排后，
    # 靠 Character.id 稳定 tie-break → 最后是 id 最大的剑魂丙）
    r = client.get("/api/admin/characters/query",
                   params={"sort": "buff_amount", "order": "asc"}, headers=admin_headers)
    names = [i["name"] for i in r.json()["items"]]
    assert names[0] == "奶妈丁"
    assert names[-1] == "剑魂丙"  # buff_amount NULL 排最后
    r = client.get("/api/admin/characters/query",
                   params={"sort": "buff_amount", "order": "desc"}, headers=admin_headers)
    assert r.json()["items"][0]["name"] == "奶妈丁"  # desc 时奶妈丁仍排最前
    # 分页
    r = client.get("/api/admin/characters/query",
                   params={"limit": 2, "offset": 1}, headers=admin_headers)
    assert len(r.json()["items"]) == 2
    assert r.json()["total"] == 4
    # 非法参数 → 400
    assert client.get("/api/admin/characters/query", params={"sort": "bogus"},
                      headers=admin_headers).status_code == 400
    assert client.get("/api/admin/characters/query", params={"order": "sideways"},
                      headers=admin_headers).status_code == 400
    assert client.get("/api/admin/characters/query", params={"class_type": "坦克"},
                      headers=admin_headers).status_code == 400
    # 空字符串参数按不过滤处理（不应 400）
    assert client.get("/api/admin/characters/query", params={"sort": "", "order": ""},
                      headers=admin_headers).status_code == 200

def test_admin_user_character_crud(client, admin_headers, db):
    _, u = register_user(client, "p9", "玩家九")
    uid = u["id"]
    # list（空）
    assert client.get(f"/api/admin/users/{uid}/characters",
                      headers=admin_headers).json() == []
    # create
    r = client.post(f"/api/admin/users/{uid}/characters", headers=admin_headers,
                    json={"name": "狂战", "job_name": "berserker", "fame": 150,
                          "simulated_damage": 2000, "sustained_dps": 800, "buff_amount": None})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["class_type"] == "输出"
    # update
    r = client.put(f"/api/admin/users/{uid}/characters/{cid}", headers=admin_headers,
                   json={"name": "狂战改", "job_name": "weapon_master", "fame": 160,
                         "simulated_damage": 2100, "sustained_dps": 850, "buff_amount": None})
    assert r.status_code == 200 and r.json()["name"] == "狂战改"
    # 他人 id 下改该角色 -> 404（归属校验）
    _, other = register_user(client, "p10", "玩家十")
    other_uid = other["id"]
    r = client.put(f"/api/admin/users/{other_uid}/characters/{cid}", headers=admin_headers,
                   json={"name": "越权改", "job_name": "berserker", "fame": 999,
                         "simulated_damage": 1, "sustained_dps": 1, "buff_amount": None})
    assert r.status_code == 404
    assert client.get(f"/api/admin/users/{uid}/characters",
                      headers=admin_headers).json()[0]["name"] == "狂战改"  # 未被改动
    # delete
    r = client.delete(f"/api/admin/users/{uid}/characters/{cid}", headers=admin_headers)
    assert r.status_code == 200
    assert client.get(f"/api/admin/users/{uid}/characters", headers=admin_headers).json() == []
    # 用户不存在 404
    assert client.get("/api/admin/users/99999/characters", headers=admin_headers).status_code == 404

def test_ban_unban_user(client, admin_headers, db):
    _, u = register_user(client, "ban1", "被禁玩家")
    uid = u["id"]
    r = client.post(f"/api/admin/users/{uid}/ban", headers=admin_headers)
    assert r.status_code == 200 and r.json()["is_banned"] is True
    # 解封
    r = client.post(f"/api/admin/users/{uid}/unban", headers=admin_headers)
    assert r.status_code == 200 and r.json()["is_banned"] is False
    # 不能封禁自己（管理员 id=1；self-check 优先于 is_admin 分支）
    r = client.post("/api/admin/users/1/ban", headers=admin_headers)
    assert r.status_code == 403 and r.json()["detail"] == "不能封禁自己"
    # 用户不存在
    assert client.post("/api/admin/users/99999/ban", headers=admin_headers).status_code == 404

def test_banned_cannot_signup_or_be_placed(client, admin_headers, db):
    h, u = register_user(client, "bannedA", "被封甲")
    _add_char(db, u["id"], name="剑魂", fame=100)
    raid = make_raid(client, admin_headers)
    rid = raid["id"]
    char_id = db.query(Character).filter(Character.user_id == u["id"]).one().id
    # 先封禁 → 自报名被拒
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    r = client.post(f"/api/raids/{rid}/signup", headers=h)
    assert r.status_code == 403
    # 解封后报名成功，再封禁（封禁保留报名）→ 排表被拒
    client.post(f"/api/admin/users/{u['id']}/unban", headers=admin_headers)
    assert client.post(f"/api/raids/{rid}/signup", headers=h).status_code == 200
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    slot_id = raid["waves"][0]["slots"][0]["id"]
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=admin_headers,
                    json={"character_id": char_id})
    assert r.status_code == 403
    # 解封后可正常排
    client.post(f"/api/admin/users/{u['id']}/unban", headers=admin_headers)
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=admin_headers,
                    json={"character_id": char_id})
    assert r.status_code == 200

def test_banned_admin_signup_blocked(client, admin_headers, db):
    h, u = register_user(client, "bannedB", "被封乙")
    raid = make_raid(client, admin_headers)
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    r = client.post(f"/api/raids/{raid['id']}/signups", headers=admin_headers,
                    json={"user_id": u["id"]})
    assert r.status_code == 403
