from .helpers import make_raid, register_user, signup

def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}

def _add_wave(client, ah, rid, n):
    for _ in range(n):
        assert client.post(f"/api/raids/{rid}/waves", headers=ah, json={}).status_code == 200

def _waves(client, ah, rid):
    return client.get(f"/api/raids/{rid}", headers=ah).json()["waves"]

def _mkchar(client, h, name):
    return client.post("/api/me/characters", headers=h,
                       json={"name": name, "job_name": "weapon_master", "fame": 1}).json()["id"]

def test_parallelize_two_waves_share_round(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    assert client.post(f"/api/raids/{rid}/waves/2/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    ws = _waves(client, ah, rid)
    assert [(w["index"], w["round_index"], w["group_index"], w["group_id"] is not None)
            for w in ws] == [(1, 1, 1, True), (2, 1, 2, True)]
    assert ws[0]["group_id"] == ws[1]["group_id"]

def test_parallelize_renumber_with_standalone(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 2)   # w2, w3
    assert client.post(f"/api/raids/{rid}/waves/2/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    ws = _waves(client, ah, rid)
    assert [w["index"] for w in ws] == [1, 2, 3]
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (1, 2), (2, 1)]
    assert ws[2]["group_id"] is None

def test_noncontiguous_round_order(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 3)   # w2, w3, w4
    assert client.post(f"/api/raids/{rid}/waves/2/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    assert client.post(f"/api/raids/{rid}/waves/4/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 200
    ws = _waves(client, ah, rid)
    assert [w["index"] for w in ws] == [1, 2, 4, 3]
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (1, 2), (1, 3), (2, 1)]

def test_parallelize_errors(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/waves/1/parallel",
                       headers=ah, json={"target_index": 99}).status_code == 404
    assert client.post(f"/api/raids/{rid}/waves/1/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 400
    h, _ = register_user(client, "parp", "甲")
    assert client.post(f"/api/raids/{rid}/waves/1/parallel",
                       headers=h, json={"target_index": 1}).status_code == 403

def test_unparallelize_and_single_round_invariant(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    assert client.delete(f"/api/raids/{rid}/waves/2/parallel", headers=ah).status_code == 200
    ws = _waves(client, ah, rid)
    assert all(w["group_id"] is None for w in ws)
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (2, 1)]
    assert client.delete(f"/api/raids/{rid}/waves/2/parallel", headers=ah).status_code == 400
    h, _ = register_user(client, "parq", "乙")
    assert client.delete(f"/api/raids/{rid}/waves/1/parallel", headers=h).status_code == 403

def test_parallelize_exit_prunes_single_round(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 2)   # w2, w3
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    client.post(f"/api/raids/{rid}/waves/1/parallel", headers=ah, json={"target_index": 3})
    ws = _waves(client, ah, rid)
    assert [w["index"] for w in ws] == [1, 3, 2]
    assert [(w["round_index"], w["group_index"]) for w in ws] == [(1, 1), (1, 2), (2, 1)]
    assert ws[0]["group_id"] == ws[1]["group_id"] and ws[0]["group_id"] is not None
    assert ws[2]["group_id"] is None

def test_delete_wave_in_round_prunes(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    assert client.delete(f"/api/raids/{rid}/waves/2", headers=ah).status_code == 200
    ws = _waves(client, ah, rid)
    assert len(ws) == 1 and ws[0]["group_id"] is None

def test_parallelize_merge_conflict_400(client):
    ah = _admin(client)
    h, _ = register_user(client, "parm", "丙")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 1)   # w2
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})  # 轮{1,2}
    w1 = next(w for w in _waves(client, ah, rid) if w["index"] == 1)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200   # 丙 在轮{1,2} 占 C1
    _add_wave(client, ah, rid, 1)   # w3 独立
    w3 = next(w for w in _waves(client, ah, rid) if w["index"] == 3)
    s3 = next(s for s in w3["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s3['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 200
    # w3 加入轮{1,2} 会令 丙 跨两波占位 → 400，且状态不变
    assert client.post(f"/api/raids/{rid}/waves/3/parallel",
                       headers=ah, json={"target_index": 1}).status_code == 400
    w3_after = next(w for w in _waves(client, ah, rid) if w["index"] == 3)
    assert w3_after["group_id"] is None

def test_ws_broadcast_parallel_events(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    rid = make_raid(client, ah)["id"]
    _add_wave(client, ah, rid, 1)
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
        assert ws.receive_json()["type"] == "wave:parallelized"
        client.delete(f"/api/raids/{rid}/waves/2/parallel", headers=ah)
        assert ws.receive_json()["type"] == "wave:parallel_removed"

def test_fill_same_player_across_parallel_waves_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "parf", "丁")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    w1 = next(w for w in _waves(client, ah, rid) if w["index"] == 1)
    w2 = next(w for w in _waves(client, ah, rid) if w["index"] == 2)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    assert client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h,
                       json={"character_id": c1}).status_code == 200
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": c2})
    assert r.status_code == 400
    assert "同一轮次" in r.json()["detail"]

def test_fill_replace_across_parallel_waves(client):
    ah = _admin(client)
    h, _ = register_user(client, "parg", "戊")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 1)
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})
    w1 = next(w for w in _waves(client, ah, rid) if w["index"] == 1)
    w2 = next(w for w in _waves(client, ah, rid) if w["index"] == 2)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h, json={"character_id": c1})
    r = client.post(f"/api/raids/{rid}/slots/{s2['id']}/fill", headers=h,
                    json={"character_id": c2, "replace": True})
    assert r.status_code == 200
    assert [s["id"] for s in r.json()["removed_slots"]] == [s1["id"]]

def test_move_cross_parallel_round_duplicate_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "parh", "己")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    signup(client, rid, h)
    _add_wave(client, ah, rid, 2)   # w2, w3
    client.post(f"/api/raids/{rid}/waves/2/parallel", headers=ah, json={"target_index": 1})  # 轮{1,2}
    ws = _waves(client, ah, rid)
    w1 = next(w for w in ws if w["index"] == 1)
    w2 = next(w for w in ws if w["index"] == 2)
    w3 = next(w for w in ws if w["index"] == 3)
    s1 = next(s for s in w1["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s2 = next(s for s in w2["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    s3 = next(s for s in w3["slots"] if s["squad_index"] == 0 and s["row_index"] == 0)
    client.post(f"/api/raids/{rid}/slots/{s1['id']}/fill", headers=h, json={"character_id": c1})
    client.post(f"/api/raids/{rid}/slots/{s3['id']}/fill", headers=h, json={"character_id": c2})
    # 把 w3 的 C2（己）移到 w2（与 w1 同轮）→ 己 在轮{1,2}占两格 → 400
    r = client.post(f"/api/raids/{rid}/slots/{s3['id']}/move", headers=ah,
                    json={"target_slot_id": s2["id"]})
    assert r.status_code == 400
    assert "同一轮次" in r.json()["detail"]
