from .helpers import make_dungeon, make_raid, register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def test_create_raid_only_admin(client):
    h, _ = register_user(client, "p1", "甲")
    ah = _admin(client)
    did = make_dungeon(client, ah)["id"]
    r = client.post("/api/raids", headers=h, json={
        "name": "x", "dungeon_id": did, "starts_at": "2026-09-20T14:00:00"})
    assert r.status_code == 403
    rid = make_raid(client, ah, dungeon_id=did)["id"]
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert detail["size"] == 12
    assert len(detail["waves"]) == 1
    assert len(detail["waves"][0]["slots"]) == 12
    assert {s["squad_index"] for s in detail["waves"][0]["slots"]} == {0, 1, 2}

def test_lock_unlock(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/lock", headers=ah).status_code == 200
    assert client.get(f"/api/raids/{rid}", headers=ah).json()["locked"] is True
    assert client.post(f"/api/raids/{rid}/unlock", headers=ah).status_code == 200

def test_member_fill_remove_duty(client):
    ah = _admin(client)
    h, user = register_user(client, "p2", "乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 20000,
        "simulated_damage": 600000, "sustained_dps": 400000}).json()["id"]
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    slot0 = slots[0]

    # fill -> duty default 主C
    r = client.post(f"/api/raids/{rid}/slots/{slot0['id']}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
    assert r.json()["slot"]["duty"] == "主C"
    assert r.json()["slot"]["owner_nickname"] == "乙"
    assert r.json()["slot"]["character_name"] == "剑魂"
    assert "缺少辅助" in r.json()["warnings"]

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
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h2).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h2,
                    json={"character_id": cid})
    assert r.status_code == 400

def test_character_unique_across_waves(client):
    ah = _admin(client)
    h, _ = register_user(client, "p5", "戊")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
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

def test_one_character_per_player_per_wave(client):
    ah = _admin(client)
    h, _ = register_user(client, "p10", "癸")
    c1 = client.post("/api/me/characters", headers=h, json={
        "name": "C1", "class_type": "输出", "fame": 1}).json()["id"]
    c2 = client.post("/api/me/characters", headers=h, json={
        "name": "C2", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    s_a = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    s_b = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    # 同一波：第一个角色占位成功
    assert client.post(f"/api/raids/{rid}/slots/{s_a['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    # 同一波再上第二个角色 → 同一玩家本波唯一 → 400
    assert client.post(f"/api/raids/{rid}/slots/{s_b['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 400
    # 不同波次可以再上另一个角色
    client.post(f"/api/raids/{rid}/waves", headers=h, json={})
    w2 = next(w for w in client.get(f"/api/raids/{rid}", headers=h).json()["waves"]
              if w["index"] == 2)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 200

def test_fill_replace_moves_conflicting_slot(client):
    ah = _admin(client)
    h, _ = register_user(client, "p13", "寅")
    c1 = client.post("/api/me/characters", headers=h, json={
        "name": "C1", "class_type": "输出", "fame": 1}).json()["id"]
    c2 = client.post("/api/me/characters", headers=h, json={
        "name": "C2", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"]
    s_a = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    s_b = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s_a['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    # 同波再放 C2 → replace：C2 放 s_b，撤下 s_a 的 C1
    r = client.post(f"/api/raids/{rid}/slots/{s_b['id']}/fill", headers=h,
                    json={"character_id": c2, "replace": True})
    assert r.status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=h)
             .json()["waves"][0]["slots"]}
    assert by_id[s_b["id"]]["character_id"] == c2
    assert by_id[s_a["id"]]["character_id"] is None
    assert [s["id"] for s in r.json()["removed_slots"]] == [s_a["id"]]

def test_fill_replace_moves_same_character(client):
    ah = _admin(client)
    h, _ = register_user(client, "p14", "卯")
    c1 = client.post("/api/me/characters", headers=h, json={
        "name": "C1", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    w1 = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]
    s1 = w1["slots"][0]
    client.post(f"/api/raids/{rid}/waves", headers=h, json={})
    w2 = next(w for w in client.get(f"/api/raids/{rid}", headers=h).json()["waves"]
              if w["index"] == 2)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    # 同一角色想放另一波 → replace：撤下 wave1，放到 wave2
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": c1, "replace": True})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()["waves"]
    w1s = {s["id"]: s for s in next(w for w in detail if w["index"] == 1)["slots"]}
    w2s = {s["id"]: s for s in next(w for w in detail if w["index"] == 2)["slots"]}
    assert w1s[s1["id"]]["character_id"] is None
    assert w2s[s2["id"]]["character_id"] == c1

def test_main_healer_limit(client):
    ah = _admin(client)
    h1, _ = register_user(client, "p6", "己")
    h2, _ = register_user(client, "p6b", "己b")
    c1 = client.post("/api/me/characters", headers=h1, json={
        "name": "奶1", "class_type": "辅助", "fame": 1, "buff_amount": 9000}).json()["id"]
    c2 = client.post("/api/me/characters", headers=h2, json={
        "name": "奶2", "class_type": "辅助", "fame": 1, "buff_amount": 8000}).json()["id"]
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=h1).json()["waves"][0]["slots"]
    s0, s1 = slots[0], slots[1]
    # c1 默认主奶，占位成功
    assert client.post(f"/api/raids/{rid}/slots/{s0['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200
    # c2 默认主奶 → 超限 400
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h2,
                       json={"character_id": c2}).status_code == 400
    # 指定太阳奶可占位
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h2,
                       json={"character_id": c2, "duty": "太阳奶"}).status_code == 200
    # 之后想改成主奶 → 400
    assert client.put(f"/api/raids/{rid}/slots/{s1['id']}/duty", headers=h2,
                      json={"duty": "主奶"}).status_code == 400

def test_full_squad_composition_error(client):
    ah = _admin(client)
    # 同一玩家同波只能上一个角色，故用 4 个不同玩家各建一个输出，专测组成规则
    hs = [register_user(client, f"sq{i}", f"sq{i}")[0] for i in range(4)]
    ids = [client.post("/api/me/characters", headers=h, json={
        "name": f"C{i}", "class_type": "输出", "fame": 1}).json()["id"]
        for i, h in enumerate(hs)]
    rid = make_raid(client, ah)["id"]
    squad0 = [s for s in client.get(f"/api/raids/{rid}", headers=hs[0]).json()["waves"][0]["slots"]
              if s["squad_index"] == 0]
    for i in range(3):
        assert client.post(f"/api/raids/{rid}/slots/{squad0[i]['id']}/fill", headers=hs[i],
                           json={"character_id": ids[i]}).status_code == 200
    # 第 4 个输出占满小队 → 缺少辅助，硬错误 400
    assert client.post(f"/api/raids/{rid}/slots/{squad0[3]['id']}/fill", headers=hs[3],
                       json={"character_id": ids[3]}).status_code == 400

def test_locked_raid_only_admin_edits(client):
    ah = _admin(client)
    h, _ = register_user(client, "p7", "庚")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": cid}).status_code == 403

def test_wave_add_and_delete_rules(client):
    ah = _admin(client)
    h, user = register_user(client, "p8", "辛")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "C", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
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
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h, json={"character_id": cid})
    r = client.delete(f"/api/me/characters/{cid}", headers=h)
    assert r.status_code == 400

def test_create_raid_size_from_dungeon(client):
    ah = _admin(client)
    d = make_dungeon(client, ah, name="16人本", size=16)
    r = client.post("/api/raids", headers=ah, json={
        "name": "x", "dungeon_id": d["id"], "starts_at": "2026-09-20T14:00:00"})
    assert r.status_code == 200
    assert r.json()["size"] == 16
    assert r.json()["dungeon_name"] == "16人本"
    assert r.json()["starts_at"] == "2026-09-20T14:00:00"

def test_create_raid_name_defaults_to_dungeon(client):
    ah = _admin(client)
    d = make_dungeon(client, ah, name="巴卡尔")
    r = client.post("/api/raids", headers=ah, json={
        "dungeon_id": d["id"], "starts_at": "2026-09-20T14:00:00"})
    assert r.status_code == 200 and r.json()["name"] == "巴卡尔"

def test_create_raid_requires_starts_at(client):
    ah = _admin(client)
    d = make_dungeon(client, ah)
    assert client.post("/api/raids", headers=ah,
                       json={"name": "x", "dungeon_id": d["id"]}).status_code == 422

def test_create_raid_unknown_dungeon(client):
    ah = _admin(client)
    assert client.post("/api/raids", headers=ah, json={
        "name": "x", "dungeon_id": 999,
        "starts_at": "2026-09-20T14:00:00"}).status_code == 404

def test_update_raid_name_starts_at_only(client):
    ah = _admin(client)
    d = make_dungeon(client, ah, size=12)
    rid = make_raid(client, ah, dungeon_id=d["id"])["id"]
    r = client.put(f"/api/raids/{rid}", headers=ah, json={
        "name": "改名", "starts_at": "2026-09-21T10:30:00"})
    assert r.status_code == 200
    assert r.json()["name"] == "改名"
    assert r.json()["starts_at"] == "2026-09-21T10:30:00"
    assert r.json()["size"] == 12

def test_delete_raid_only_admin(client):
    ah = _admin(client)
    h, _ = register_user(client, "pDel1", "删甲")
    rid = make_raid(client, ah)["id"]
    assert client.delete(f"/api/raids/{rid}", headers=h).status_code == 403
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200
    assert client.get(f"/api/raids/{rid}", headers=h).status_code == 404

def test_delete_raid_cascades(client):
    ah = _admin(client)
    h, _ = register_user(client, "pDel2", "删乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "class_type": "输出", "fame": 1}).json()["id"]
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": cid})
    assert client.delete(f"/api/raids/{rid}", headers=ah).status_code == 200
    # 攻坚已不存在（波次/格子随之级联删除）
    assert client.get(f"/api/raids/{rid}", headers=h).status_code == 404
    # 角色不再被占用格子引用，可以删除
    assert client.delete(f"/api/me/characters/{cid}", headers=h).status_code == 200

def test_delete_raid_not_found(client):
    ah = _admin(client)
    assert client.delete("/api/raids/999", headers=ah).status_code == 404
