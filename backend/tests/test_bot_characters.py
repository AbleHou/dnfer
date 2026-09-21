from .helpers import register_user

TOKEN = {"Authorization": "Bearer change-me-bot-token"}

def test_requires_token(client):
    assert client.post("/api/public/characters", json={}).status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.post("/api/public/characters", json={}, headers=bad).status_code == 401

def test_create_with_defaults(client):
    register_user(client, "p1", "甲")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p1", "characters": [{"name": "剑魂"}]})
    assert r.status_code == 200
    body = r.json()
    assert body["account"] == "p1"
    res = body["results"][0]
    assert res["ok"] is True and res["action"] == "created"
    assert res["character"]["job_name"] == "weapon_master"
    assert res["character"]["job_title"] == "极诣·剑魂"
    assert res["character"]["fame"] == 100000

def test_upsert_updates_by_name(client):
    h, _ = register_user(client, "p2", "乙")
    url = "/api/public/characters"
    client.post(url, headers=TOKEN, json={"account": "p2", "characters": [
        {"name": "剑魂", "job_name": "weapon_master", "fame": 21000,
         "simulated_damage": 680000}]})
    r = client.post(url, headers=TOKEN, json={"account": "p2", "characters": [
        {"name": "剑魂", "fame": 30000}]})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] is True and res["action"] == "updated"
    c = res["character"]
    assert c["fame"] == 30000
    assert c["job_name"] == "weapon_master"      # 职业未提供 → 保留原值
    assert c["simulated_damage"] == 680000        # 数值未提供 → 保留原值

def test_invalid_job_partial_failure(client):
    register_user(client, "p3", "丙")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p3", "characters": [
            {"name": "剑魂"},
            {"name": "乱来", "job_name": "not_a_job"}]})
    assert r.status_code == 200
    results = r.json()["results"]
    assert results[0]["ok"] is True and results[0]["action"] == "created"
    assert results[1]["ok"] is False
    assert results[1]["error"] == "职业不存在"

def test_edit_with_invalid_job_rejected(client):
    h, _ = register_user(client, "p4", "丁")
    client.post("/api/public/characters", headers=TOKEN, json={"account": "p4",
        "characters": [{"name": "剑魂", "job_name": "weapon_master", "fame": 21000}]})
    r = client.post("/api/public/characters", headers=TOKEN, json={"account": "p4",
        "characters": [{"name": "剑魂", "job_name": "not_a_job", "fame": 50000}]})
    assert r.status_code == 200
    res = r.json()["results"][0]
    assert res["ok"] is False and res["error"] == "职业不存在"
    chars = client.get("/api/me/characters", headers=h).json()
    assert chars[0]["fame"] == 21000 and chars[0]["job_name"] == "weapon_master"

def test_batch_multiple_results(client):
    register_user(client, "p5", "戊")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p5", "characters": [
            {"name": "剑魂"}, {"name": "鬼泣", "job_name": "soul_bender"}]})
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2

def test_duplicate_names_in_one_request(client):
    h, _ = register_user(client, "p6", "己")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p6", "characters": [
            {"name": "剑魂", "fame": 1000},
            {"name": "剑魂", "fame": 2000}]})
    assert r.status_code == 200
    results = r.json()["results"]
    assert [x["action"] for x in results] == ["created", "updated"]
    assert results[1]["character"]["fame"] == 2000
    chars = client.get("/api/me/characters", headers=h).json()
    assert len(chars) == 1 and chars[0]["fame"] == 2000

def test_empty_characters_list(client):
    register_user(client, "p7", "庚")
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p7", "characters": []})
    assert r.status_code == 200
    assert r.json()["results"] == []

def test_post_nonexistent_account(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "nobody", "characters": [{"name": "x"}]})
    assert r.status_code == 404

def test_explicit_zero_fame(client):
    h, _ = register_user(client, "p10", "癸")
    # 创建时显式 0 名望 → 落 0（区别于未提供时默认 100000）
    client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p10", "characters": [{"name": "剑魂", "fame": 0}]})
    assert client.get("/api/me/characters", headers=h).json()[0]["fame"] == 0
    # 编辑时显式 0 名望 → 覆盖原值（0 非 None 应写入，不被当作缺失保留）
    client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p10", "characters": [{"name": "剑魂", "fame": 21000}]})
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "p10", "characters": [{"name": "剑魂", "fame": 0}]})
    assert r.status_code == 200
    assert r.json()["results"][0]["action"] == "updated"
    assert r.json()["results"][0]["character"]["fame"] == 0

def test_get_requires_token(client):
    assert client.get("/api/public/characters").status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.get("/api/public/characters", headers=bad).status_code == 401

def test_get_characters_by_account(client):
    register_user(client, "p8", "辛")
    client.post("/api/public/characters", headers=TOKEN, json={"account": "p8",
        "characters": [{"name": "剑魂"}, {"name": "鬼泣", "job_name": "soul_bender", "fame": 65000}]})
    r = client.get("/api/public/characters", params={"account": "p8"}, headers=TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body["account"] == "p8"
    assert body["nickname"] == "辛"
    names = [c["name"] for c in body["characters"]]
    assert names == ["剑魂", "鬼泣"]          # 按 id 升序 = 创建顺序
    assert body["characters"][1]["job_name"] == "soul_bender"
    assert body["characters"][1]["fame"] == 65000

def test_get_nonexistent_account(client):
    r = client.get("/api/public/characters", params={"account": "nobody"}, headers=TOKEN)
    assert r.status_code == 404

def test_round_trip(client):
    register_user(client, "p9", "壬")
    client.post("/api/public/characters", headers=TOKEN, json={"account": "p9",
        "characters": [{"name": "奶妈", "job_name": "crusader_female", "buff_amount": 2000}]})
    r = client.get("/api/public/characters", params={"account": "p9"}, headers=TOKEN)
    assert r.status_code == 200
    c = r.json()["characters"][0]
    assert c["name"] == "奶妈"
    assert c["class_type"] == "辅助"
    assert c["buff_amount"] == 2000

def test_add_both_account_and_nickname(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "account": "x", "nickname": "y", "characters": [{"name": "剑魂"}]})
    assert r.status_code == 422

def test_add_missing_both_identities(client):
    r = client.post("/api/public/characters", headers=TOKEN, json={
        "characters": [{"name": "剑魂"}]})
    assert r.status_code == 422
