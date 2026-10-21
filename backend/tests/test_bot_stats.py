from .helpers import register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}


def _bot_add(client, account, chars):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": account, "characters": chars})
    assert r.status_code == 200


def test_requires_token(client):
    assert client.get("/api/public/stats/overview").status_code == 401
    assert client.get("/api/public/stats/overview",
                      headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_overview_valid_users_and_distributions(client, admin_headers):
    register_user(client, "u1", "甲")
    register_user(client, "u2", "乙")
    # 临时用户（guest）与封禁用户不计入
    g = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "来客", "characters": [{"name": "奶", "job_name": "crusader_female"}]})
    assert g.status_code == 200
    gu = g.json()["user"]
    client.post(f"/api/admin/users/{gu['id']}/ban", headers=admin_headers)

    _bot_add(client, "u1", [
        {"name": "剑魂", "job_name": "weapon_master", "fame": 210000},
        {"name": "奶妈", "job_name": "crusader_female", "fame": 190000},
    ])
    _bot_add(client, "u2", [
        {"name": "狂战", "job_name": "berserker", "fame": 200000},
        {"name": "气功", "job_name": "nenmaster_male", "fame": 180000},
    ])

    r = client.get("/api/public/stats/overview", headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    # 有效用户数：3 = 群主(admin 种入，0 角色) + 甲 + 乙（guest 不计、封禁 guest 更不计）
    assert body["total_users"] == 3
    # 每用户角色数（含 0 角色用户），按角色数降序、昵称码点序 tie-break（乙 < 甲）
    assert body["users"] == [
        {"nickname": "乙", "character_count": 2},
        {"nickname": "甲", "character_count": 2},
        {"nickname": "群主", "character_count": 0},
    ]
    # 三粒度分布
    assert body["class_types"] == [
        {"class_type": "输出", "count": 3},   # weapon_master + berserker + nenmaster_male
        {"class_type": "辅助", "count": 1},   # crusader_female
    ]
    cats = {c["name"]: c["count"] for c in body["categories"]}
    # weapon_master+berserker→swordman_male、nenmaster_male→fighter_male、crusader_female→priest_female
    assert cats == {"swordman_male": 2, "fighter_male": 1, "priest_female": 1}
    jobs = {j["job_name"]: (j["job_title"], j["count"]) for j in body["jobs"]}
    assert jobs["weapon_master"] == ("极诣·剑魂", 1)
    assert jobs["berserker"] == ("极诣·狂战士", 1)
    assert jobs["nenmaster_male"] == ("归元·气功师", 1)
    assert jobs["crusader_female"] == ("光启·光明骑士", 1)


def test_overview_users_include_zero_char_user(client):
    register_user(client, "u1", "有角色")
    register_user(client, "u2", "没角色")
    _bot_add(client, "u1", [{"name": "剑魂", "job_name": "weapon_master"}])
    body = client.get("/api/public/stats/overview", headers=TOKEN).json()
    assert body["total_users"] == 3  # 群主(admin) 也是有效用户
    assert body["users"] == [
        {"nickname": "有角色", "character_count": 1},
        {"nickname": "没角色", "character_count": 0},   # 没 < 群（码点序）
        {"nickname": "群主", "character_count": 0},
    ]


def _mk_sword(client, account, nickname, job="weapon_master", fame=200000):
    register_user(client, account, nickname)
    _bot_add(client, account, [{"name": "剑", "job_name": job, "fame": fame}])


def test_characters_by_job_code_and_title(client):
    _mk_sword(client, "a1", "甲")
    _mk_sword(client, "a2", "乙", job="berserker", fame=300000)
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "weapon_master"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["job_name"] == "weapon_master"
    assert body["items"][0]["owner_nickname"] is None  # 默认不带玩家信息
    # title 精确匹配同样命中
    r2 = client.get("/api/public/stats/characters", headers=TOKEN,
                    params={"job": "极诣·剑魂"})
    assert r2.json()["total"] == 1


def test_characters_gender_split_title(client):
    _mk_sword(client, "a1", "甲", job="crusader_male", fame=100000)
    _mk_sword(client, "a2", "乙", job="crusader_female", fame=100000)
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "光启·光明骑士"})
    assert r.status_code == 200
    assert r.json()["total"] == 2  # 男+女两个 code 都命中
    jobs = {i["job_name"] for i in r.json()["items"]}
    assert jobs == {"crusader_male", "crusader_female"}


def test_characters_by_category_name_and_prefix(client):
    _mk_sword(client, "a1", "甲", job="weapon_master", fame=100000)   # swordman_male 鬼剑士(男)
    _mk_sword(client, "a2", "乙", job="sword_master", fame=100000)    # swordman_female 鬼剑士(女)
    _mk_sword(client, "a3", "丙", job="berserker", fame=100000)       # swordman_male
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"category": "swordman_female"})
    assert r.json()["total"] == 1
    # title 前缀「鬼剑士」命中男女两个大类
    r2 = client.get("/api/public/stats/characters", headers=TOKEN,
                    params={"category": "鬼剑士"})
    assert r2.json()["total"] == 3


def test_characters_by_class_type(client):
    _mk_sword(client, "a1", "甲", job="weapon_master", fame=100000)   # 输出
    _mk_sword(client, "a2", "乙", job="crusader_female", fame=100000) # 辅助
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"class_type": "输出"})
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["job_name"] == "weapon_master"


def test_characters_filters_combine_with_and(client):
    _mk_sword(client, "a1", "甲", job="weapon_master", fame=100000)    # swordman_male/输出
    _mk_sword(client, "a2", "乙", job="crusader_female", fame=100000)  # priest_female/辅助
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"category": "swordman_male", "class_type": "输出"})
    assert r.json()["total"] == 1  # AND：大类与输出 同时命中才计入
    r2 = client.get("/api/public/stats/characters", headers=TOKEN,
                    params={"category": "swordman_male", "class_type": "辅助"})
    assert r2.json()["total"] == 0  # swordman_male 无辅助 → 交集为空


def test_characters_with_owner_flag(client):
    _mk_sword(client, "a1", "甲")
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "weapon_master", "with_owner": "true"})
    body = r.json()
    assert body["items"][0]["owner_nickname"] == "甲"


def test_characters_sorted_by_fame_desc(client):
    _mk_sword(client, "a1", "甲", fame=100000)
    _mk_sword(client, "a2", "乙", fame=500000)
    _mk_sword(client, "a3", "丙", fame=300000)
    body = client.get("/api/public/stats/characters", headers=TOKEN,
                      params={"job": "weapon_master"}).json()
    fames = [i["fame"] for i in body["items"]]
    assert fames == [500000, 300000, 100000]


def test_characters_excludes_guest_and_banned(client, admin_headers):
    _mk_sword(client, "a1", "甲")
    g = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "来客", "characters": [{"name": "剑", "job_name": "weapon_master"}]})
    gu = g.json()["user"]
    b = client.post("/api/admin/users", headers=admin_headers,
                    json={"nickname": "封客", "characters": [{"name": "剑2", "job_name": "weapon_master"}]})
    bu = b.json()["user"]
    client.post(f"/api/admin/users/{bu['id']}/ban", headers=admin_headers)
    body = client.get("/api/public/stats/characters", headers=TOKEN,
                      params={"job": "weapon_master"}).json()
    assert body["total"] == 1  # guest 与封禁用户的角色都被排除


def test_characters_validation_errors(client):
    assert client.get("/api/public/stats/characters", headers=TOKEN).status_code == 400
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"class_type": "坦克"})
    assert r.status_code == 400 and r.json()["detail"] == "职业类别无效"
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"job": "nope"})
    assert r.status_code == 400 and r.json()["detail"] == "职业不存在"
    r = client.get("/api/public/stats/characters", headers=TOKEN,
                   params={"category": "nope"})
    assert r.status_code == 400 and r.json()["detail"] == "职业类别不存在"
