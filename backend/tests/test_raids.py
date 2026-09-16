from .helpers import register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_create_raid_only_admin(client):
    h, _ = register_user(client, "p1", "甲")
    r = client.post("/api/raids", headers=h, json={"name": "巴卡尔", "size": 12})
    assert r.status_code == 403
    ah = _admin(client)
    r = client.post("/api/raids", headers=ah, json={"name": "巴卡尔", "size": 12})
    assert r.status_code == 200
    rid = r.json()["id"]
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert detail["size"] == 12
    assert len(detail["waves"]) == 1
    assert len(detail["waves"][0]["slots"]) == 12
    assert {s["squad_index"] for s in detail["waves"][0]["slots"]} == {0, 1, 2}

def test_create_raid_rejects_bad_size(client):
    ah = _admin(client)
    assert client.post("/api/raids", headers=ah, json={"name": "x", "size": 10}).status_code == 400

def test_lock_unlock(client):
    ah = _admin(client)
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    assert client.post(f"/api/raids/{rid}/lock", headers=ah).status_code == 200
    assert client.get(f"/api/raids/{rid}", headers=ah).json()["locked"] is True
    assert client.post(f"/api/raids/{rid}/unlock", headers=ah).status_code == 200

def test_member_fill_remove_duty(client):
    ah = _admin(client)
    h, user = register_user(client, "p2", "乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 20000,
        "simulated_damage": 600000, "sustained_dps": 400000}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    slot0 = slots[0]

    # fill -> duty default 主C
    r = client.post(f"/api/raids/{rid}/slots/{slot0['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
    assert r.json()["slot"]["duty"] == "主C"
    assert r.json()["slot"]["owner_nickname"] == "乙"
    assert r.json()["slot"]["character_name"] == "剑魂"

    # change duty
    r = client.put(f"/api/raids/{rid}/slots/{slot0['id']}/duty", headers=h, json={"duty": "辅C"})
    assert r.status_code == 200
    assert r.json()["slot"]["duty"] == "辅C"

    # remove
    assert client.delete(f"/api/raids/{rid}/slots/{slot0['id']}", headers=h).status_code == 200

def test_cannot_fill_others_characters(client):
    ah = _admin(client)
    h1, _ = register_user(client, "p3", "丙")
    h2, _ = register_user(client, "p4", "丁")
    cid = client.post("/api/me/characters", headers=h1, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h2).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h2,
                    json={"character_id": cid})
    assert r.status_code == 400

def test_character_unique_across_waves(client):
    ah = _admin(client)
    h, _ = register_user(client, "p5", "戊")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    client.post(f"/api/raids/{rid}/waves", headers=h, json={})  # add wave 2
    w1, w2 = [w for w in client.get(f"/api/raids/{rid}", headers=h).json()["waves"]
              if w["index"] in (1, 2)]
    s1 = w1["slots"][0]
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 200
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 400

def test_main_healer_limit(client):
    ah = _admin(client)
    h, _ = register_user(client, "p6", "己")
    c1 = client.post("/api/me/characters", headers=h, json={
        "name": "奶1", "class_type": "辅助", "fame": 1, "buff_amount": 9000}).json()["id"]
    c2 = client.post("/api/me/characters", headers=h, json={
        "name": "奶2", "class_type": "辅助", "fame": 1, "buff_amount": 8000}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    s0, s1 = slots[0], slots[1]
    # c1 默认主奶，占位成功
    assert client.post(f"/api/raids/{rid}/slots/{s0['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    # c2 默认主奶 → 超限 400
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 400
    # 指定太阳奶可占位
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c2, "duty": "太阳奶"}).status_code == 200
    # 之后想改成主奶 → 400
    assert client.put(f"/api/raids/{rid}/slots/{s1['id']}/duty", headers=h,
                      json={"duty": "主奶"}).status_code == 400

def test_full_squad_composition_error(client):
    ah = _admin(client)
    h, _ = register_user(client, "p6b", "己b")
    ids = [client.post("/api/me/characters", headers=h, json={
        "name": f"C{i}", "class_type": "输出", "fame": 1}).json()["id"]
        for i in range(4)]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    squad0 = [s for s in client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
              if s["squad_index"] == 0]
    for i in range(3):
        assert client.post(f"/api/raids/{rid}/slots/{squad0[i]['id']}/fill", headers=h,
                           json={"character_id": ids[i]}).status_code == 200
    # 第 4 个输出占满小队 → 缺少辅助，硬错误 400
    assert client.post(f"/api/raids/{rid}/slots/{squad0[3]['id']}/fill", headers=h,
                       json={"character_id": ids[3]}).status_code == 400

def test_locked_raid_only_admin_edits(client):
    ah = _admin(client)
    h, _ = register_user(client, "p7", "庚")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 403

def test_wave_add_and_delete_rules(client):
    ah = _admin(client)
    h, user = register_user(client, "p8", "辛")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = client.post("/api/raids", headers=ah, json={"name": "x", "size": 12}).json()["id"]
    # add wave 2
    r = client.post(f"/api/raids/{rid}/waves", headers=h, json={})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    w2 = next(w for w in detail["waves"] if w["index"] == 2)
    assert len(w2["slots"]) == 12
    # member cannot delete wave 2 if it has someone else's character
    # (only own chars) -> fill own char then can delete
    s = w2["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=h, json={"character_id": cid})
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h).status_code == 200
    # cannot delete last wave
    assert client.delete(f"/api/raids/{rid}/waves/1", headers=h).status_code == 400

def test_delete_character_in_use_blocked(client):
    h, _ = register_user(client, "p9", "壬")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 10000}).json()["id"]
    ah = _admin(client)
    rid = client.post("/api/raids", headers=ah, json={"name": "巴卡尔", "size": 12}).json()["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h, json={"character_id": cid})
    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 400
