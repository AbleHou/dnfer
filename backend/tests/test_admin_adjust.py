from .helpers import make_raid, register_user

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def _mkchar(client, h, name, job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]

def test_admin_can_replace_occupied_slot(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "rep1", "甲")
    h2, u2 = register_user(client, "rep2", "乙")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    # 甲先占 sA
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200
    # 管理员用乙的 C2 直接换掉 sA 上的 C1
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=ah,
                    json={"character_id": c2, "replace": True})
    assert r.status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c2
    assert by_id[sA["id"]]["owner_nickname"] == "乙"
    # C1 被换下后可另占其他格
    sB = next(s for s in slots if s["id"] != sA["id"])
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200

def test_non_admin_cannot_fill_occupied_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "rep3", "丙")
    h2, _ = register_user(client, "rep4", "丁")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h2,
                    json={"character_id": c2})
    assert r.status_code == 400

def test_owner_can_manage_slot_admin_placed(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "own1", "甲")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    # 管理员替甲放置 C1（管理员可用任意角色）
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 甲本人（非管理员）可改职责、可撤下
    assert client.put(f"/api/raids/{rid}/slots/{slot['id']}/duty", headers=h1,
                      json={"duty": "辅C"}).status_code == 200
    assert client.delete(f"/api/raids/{rid}/slots/{slot['id']}", headers=h1).status_code == 200

def test_non_owner_cannot_manage_others_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own2", "乙")
    h2, _ = register_user(client, "own3", "丙")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h1,
                json={"character_id": c1})
    # 丙无法操作乙的格子（即便该格不是乙放置的也无所谓）
    assert client.delete(f"/api/raids/{rid}/slots/{slot['id']}", headers=h2).status_code == 403

def test_owner_can_delete_wave_with_only_own_chars_admin_placed(client):
    ah = _admin(client)
    h1, _ = register_user(client, "own4", "丁")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    # 加波 2，管理员在波 2 放丁的 C1
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w2 = next(w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] == 2)
    s = w2["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200
    # 丁可删除仅含自己角色的波 2
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=h1).status_code == 200

def test_move_to_empty_slot(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv1", "甲")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                    json={"target_slot_id": sB["id"]})
    assert r.status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] is None
    assert by_id[sB["id"]]["character_id"] == c1
    assert by_id[sB["id"]]["duty"] == "主C"
    assert r.json()["removed_slots"][0]["id"] == sA["id"]

def test_swap_two_slots(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv2", "甲")
    h2, _ = register_user(client, "mv3", "乙")
    c1 = _mkchar(client, h1, "C1")
    c2 = _mkchar(client, h2, "C2")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h2,
                json={"character_id": c2})
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": sB["id"]}).status_code == 200
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c2
    assert by_id[sB["id"]]["character_id"] == c1

def test_move_across_waves(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv4", "丙")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w1, w2 = [w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] in (1, 2)]
    sA = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    sC = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": sC["id"]}).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
    w1s = {s["id"]: s for s in next(w for w in detail if w["index"] == 1)["slots"]}
    w2s = {s["id"]: s for s in next(w for w in detail if w["index"] == 2)["slots"]}
    assert w1s[sA["id"]]["character_id"] is None
    assert w2s[sC["id"]]["character_id"] == c1

def test_swap_cross_wave_duplicate_player_blocked(client):
    # 评审场景：swap 后源波内出现同玩家两次（目标玩家进入源波的方向）
    ah = _admin(client)
    h1, _ = register_user(client, "mv5", "丁")
    h2, _ = register_user(client, "mv6", "戊")
    c1 = _mkchar(client, h1, "X")   # 丁的 X
    c2 = _mkchar(client, h2, "W")   # 戊的 W
    c3 = _mkchar(client, h2, "Y")   # 戊的 Y
    rid = make_raid(client, ah)["id"]
    client.post(f"/api/raids/{rid}/waves", headers=ah, json={})
    w1, w2 = [w for w in client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]
              if w["index"] in (1, 2)]
    sA = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in w1["slots"] if s["squad_index"] == 1 and s["row_index"] == 0)
    sC = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    # 波1: A=丁X, B=戊W；波2: C=戊Y
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h2,
                json={"character_id": c2})
    client.post(f"/api/raids/{rid}/slots/{sC['id']}/fill", headers=h2,
                json={"character_id": c3})
    # swap A(X) ↔ C(Y) → 波1 出现 戊 两次 → 400 且状态不变
    r = client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                    json={"target_slot_id": sC["id"]})
    assert r.status_code == 400
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sA["id"]]["character_id"] == c1
    assert by_id[sB["id"]]["character_id"] == c2

def test_move_bad_inputs(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv7", "己")
    c1 = _mkchar(client, h1, "C1")
    raid1 = make_raid(client, ah)
    rid = raid1["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = slots[0]
    # 目标=源格 → 400
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": sA["id"]}).status_code == 400
    # 源格为空 → 400
    sB = slots[1]
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/move", headers=ah,
                       json={"target_slot_id": slots[2]["id"]}).status_code == 400
    # 目标跨攻坚 → 404（复用同一副本避免 dungeon 名唯一冲突）
    rid2 = make_raid(client, ah, dungeon_id=raid1["dungeon_id"])["id"]
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    s2 = client.get(f"/api/raids/{rid2}", headers=ah).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                       json={"target_slot_id": s2["id"]}).status_code == 404
    # 非管理员 → 403
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=h1,
                       json={"target_slot_id": slots[3]["id"]}).status_code == 403

def test_move_main_healer_limit_rollback(client):
    ah = _admin(client)
    h1, _ = register_user(client, "mv8", "庚")
    h2, _ = register_user(client, "mv9", "辛")
    h3, _ = register_user(client, "mv10", "壬")
    c1 = _mkchar(client, h1, "奶1", job="crusader_male")
    c2 = _mkchar(client, h2, "C2")
    c3 = _mkchar(client, h3, "奶3", job="crusader_male")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    sD = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 1)
    # squad0: A=奶1(主奶)；squad1: B=C2, D=奶3(主奶)
    assert client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                       json={"character_id": c1}).status_code == 200
    assert client.post(f"/api/raids/{rid}/slots/{sB['id']}/fill", headers=h2,
                       json={"character_id": c2}).status_code == 200
    assert client.post(f"/api/raids/{rid}/slots/{sD['id']}/fill", headers=h3,
                       json={"character_id": c3, "duty": "主奶"}).status_code == 200
    # 把 D 的奶3(主奶) 移到 squad0 空位 sE → squad0 双主奶 → 400 回滚
    sE = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 1)
    r = client.post(f"/api/raids/{rid}/slots/{sD['id']}/move", headers=ah,
                    json={"target_slot_id": sE["id"]})
    assert r.status_code == 400
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[sD["id"]]["character_id"] == c3
    assert by_id[sE["id"]]["character_id"] is None

def test_move_full_squad_composition_rollback(client):
    # squad0 满员且组成合法（3输出+1辅助主奶）；swap 把辅助换成输出 → 满员无辅助 → 400 回滚
    ah = _admin(client)
    hs = [register_user(client, f"fs{i}", f"fs{i}")[0] for i in range(5)]
    outs = [_mkchar(client, hs[i], f"O{i}") for i in range(3)]
    sup = _mkchar(client, hs[3], "S", job="crusader_male")
    out5 = _mkchar(client, hs[4], "O5")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    squad0 = [s for s in slots if s["squad_index"] == 0]
    for i, s in enumerate(squad0[:3]):
        assert client.post(f"/api/raids/{rid}/slots/{s['id']}/fill", headers=hs[i],
                           json={"character_id": outs[i]}).status_code == 200
    assert client.post(f"/api/raids/{rid}/slots/{squad0[3]['id']}/fill", headers=hs[3],
                       json={"character_id": sup}).status_code == 200
    sSrc = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{sSrc['id']}/fill", headers=hs[4],
                       json={"character_id": out5}).status_code == 200
    # swap O5(输出) ↔ 辅助 → squad0 变 4 输出（满员无辅助无主奶）→ 400 回滚
    r = client.post(f"/api/raids/{rid}/slots/{sSrc['id']}/move", headers=ah,
                    json={"target_slot_id": squad0[3]["id"]})
    assert r.status_code == 400
    by_id = {s["id"]: s for s in client.get(f"/api/raids/{rid}", headers=ah)
             .json()["waves"][0]["slots"]}
    assert by_id[squad0[3]["id"]]["character_id"] == sup
    assert by_id[sSrc["id"]]["character_id"] == out5

def test_move_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h1, _ = register_user(client, "mvws", "癸")
    c1 = _mkchar(client, h1, "C1")
    rid = make_raid(client, ah)["id"]
    slots = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"]
    sA = next(s for s in slots if s["squad_index"] == 0 and s["row_index"] == 0)
    sB = next(s for s in slots if s["squad_index"] == 1 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{sA['id']}/fill", headers=h1,
                json={"character_id": c1})
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        client.post(f"/api/raids/{rid}/slots/{sA['id']}/move", headers=ah,
                    json={"target_slot_id": sB["id"]})
        types = [ws.receive_json()["type"] for _ in range(2)]
        assert types == ["slot:filled", "slot:removed"]

def test_admin_characters_endpoint(client):
    ah = _admin(client)
    h1, u1 = register_user(client, "ach1", "甲")
    h2, _ = register_user(client, "ach2", "乙")
    c1 = client.post("/api/me/characters", headers=h1, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 52000}).json()
    client.post("/api/me/characters", headers=h2, json={
        "name": "奶", "job_name": "crusader_male", "fame": 1, "buff_amount": 9000})
    # 非管理员 403
    assert client.get("/api/admin/characters", headers=h1).status_code == 403
    # 管理员拿到全量（含甲、乙，跳过无角色的管理员自己/其他无角色用户）
    r = client.get("/api/admin/characters", headers=ah)
    assert r.status_code == 200
    by_nick = {p["user"]["nickname"]: p for p in r.json()}
    assert set(by_nick) == {"甲", "乙"}  # 群主无角色，被过滤
    assert {c["name"] for c in by_nick["甲"]["characters"]} == {"剑魂"}
    assert by_nick["甲"]["user"]["id"] == u1["id"]
