from .helpers import register_user

def test_character_crud(client):
    h, _ = register_user(client, "player1", "阿伟")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 21000,
        "simulated_damage": 680000, "sustained_dps": 420000})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["class_type"] == "输出"
    assert r.json()["job_title"] == "极诣·剑魂"
    assert r.json()["parent_name"] == "swordman_male"
    assert r.json()["sustained_dps"] == 420000

    r = client.get("/api/me/characters", headers=h)
    assert len(r.json()) == 1
    assert r.json()[0]["job_title"] == "极诣·剑魂"

    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂·改", "job_name": "weapon_master", "fame": 22000,
        "simulated_damage": 700000, "sustained_dps": 430000})
    assert r.status_code == 200
    assert r.json()["name"] == "剑魂·改"

    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 200
    assert client.get("/api/me/characters", headers=h).json() == []

def test_cannot_touch_others_characters(client):
    h1, _ = register_user(client, "p1", "甲")
    h2, _ = register_user(client, "p2", "乙")
    cid = client.post("/api/me/characters", headers=h1, json={
        "name": "奶", "job_name": "crusader_male", "fame": 10000, "buff_amount": 9800}).json()["id"]
    assert client.put(f"/api/me/characters/{cid}", headers=h2, json={
        "name": "x", "job_name": "crusader_male", "fame": 1}).status_code == 404
    assert client.delete(f"/api/me/characters/{cid}", headers=h2).status_code == 404

def test_support_job_derives_class_type(client):
    h, _ = register_user(client, "p9", "奶爸")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "小魔女", "job_name": "enchantress", "fame": 20000, "buff_amount": 9500})
    assert r.status_code == 200
    body = r.json()
    assert body["class_type"] == "辅助"
    assert body["job_title"] == "知源·小魔女"
    assert body["parent_name"] == "mage_female"

def test_invalid_job_name_rejected(client):
    h, _ = register_user(client, "p10", "乱来")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "x", "job_name": "not_a_job", "fame": 1})
    assert r.status_code == 400

def test_empty_job_name_rejected(client):
    h, _ = register_user(client, "p11", "占位")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "x", "job_name": "empty", "fame": 1})
    assert r.status_code == 400

def test_update_character_re_derives_class_type(client):
    h, _ = register_user(client, "p12", "转职")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "simulated_damage": 100, "sustained_dps": 50})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["class_type"] == "输出"
    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂", "job_name": "crusader_male", "fame": 1, "buff_amount": 9000})
    assert r.status_code == 200
    assert r.json()["class_type"] == "辅助"
    assert r.json()["job_title"] == "神启·圣骑士"
    assert r.json()["parent_name"] == "priest_male"
