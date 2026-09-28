from .helpers import make_raid, register_user


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _mkchar(client, h, name="C", job="weapon_master"):
    return client.post("/api/me/characters", headers=h, json={
        "name": name, "job_name": job, "fame": 1}).json()["id"]


def _signup(client, rid, h, char_ids=None):
    body = {} if char_ids is None else {"character_ids": char_ids}
    return client.post(f"/api/raids/{rid}/signup", headers=h, json=body)


def _char_ids_of(client, rid, uid, h):
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    row = next(s for s in detail["signups"] if s["user"]["id"] == uid)
    return [c["id"] for c in row["characters"]]


def test_signup_defaults_to_all_characters(client):
    ah = _admin(client)
    h, u = register_user(client, "sc1", "甲")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert _signup(client, rid, h).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], h)) == sorted([c1, c2])


def test_signup_with_specific_characters(client):
    ah = _admin(client)
    h, u = register_user(client, "sc2", "乙")
    c1 = _mkchar(client, h, "C1")
    _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert _signup(client, rid, h, [c1]).status_code == 200
    assert _char_ids_of(client, rid, u["id"], h) == [c1]


def test_signup_rejects_others_characters(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc3", "丙")
    h2, _ = register_user(client, "sc3b", "丁")
    c_other = _mkchar(client, h2)
    rid = make_raid(client, ah)["id"]
    r = _signup(client, rid, h, [c_other])
    assert r.status_code == 400
    assert r.json()["detail"] == "只能勾选自己的角色"


def test_signup_empty_characters_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc4", "戊")
    _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    r = _signup(client, rid, h, [])
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"


def test_signup_no_characters_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc5", "己")
    rid = make_raid(client, ah)["id"]
    r = _signup(client, rid, h)
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"


def test_add_signup_character(client):
    ah = _admin(client)
    h, u = register_user(client, "sc6", "庚")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    assert client.post(f"/api/raids/{rid}/signup/characters/{c2}", headers=h).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], h)) == sorted([c1, c2])


def test_add_signup_character_duplicate(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc7", "辛")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.post(f"/api/raids/{rid}/signup/characters/{c1}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "该角色已在报名中"


def test_add_signup_character_locked(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc8", "壬")
    c1 = _mkchar(client, h)
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    client.post(f"/api/raids/{rid}/lock", headers=ah)
    r = client.post(f"/api/raids/{rid}/signup/characters/{c2}", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "攻坚已锁定，无法修改报名"


def test_remove_signup_character_revokes_slot(client):
    ah = _admin(client)
    h, u = register_user(client, "sc9", "癸")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": c1})
    r = client.delete(f"/api/raids/{rid}/signup/characters/{c1}", headers=h)
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=h).json()
    assert all(s["character_id"] is None for s in detail["waves"][0]["slots"])
    assert _char_ids_of(client, rid, u["id"], h) == [c2]


def test_remove_last_character_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc10", "子")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.delete(f"/api/raids/{rid}/signup/characters/{c1}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "至少保留一个角色"


def test_remove_not_selected_rejected(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc11", "丑")
    c1 = _mkchar(client, h)
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.delete(f"/api/raids/{rid}/signup/characters/{c2}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"] == "该角色不在报名中"


def test_fill_requires_selected_character_for_member(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc12", "寅")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                    json={"character_id": c2})
    assert r.status_code == 403
    assert r.json()["detail"] == "请先勾选该角色再占位"
    client.post(f"/api/raids/{rid}/signup/characters/{c2}", headers=h)
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                       json={"character_id": c2}).status_code == 200


def test_fill_admin_unselected_character_blocked(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc13", "卯")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    r = client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                    json={"character_id": c2})
    assert r.status_code == 403
    assert r.json()["detail"] == "该角色未报名，无法排表"


def test_fill_leader_own_char_unrestricted(client):
    ah = _admin(client)
    c1 = _mkchar(client, ah, "团长C")
    rid = make_raid(client, ah)["id"]
    slot = client.get(f"/api/raids/{rid}", headers=ah).json()["waves"][0]["slots"][0]
    assert client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=ah,
                       json={"character_id": c1}).status_code == 200


def test_member_characters_only_selected(client):
    ah = _admin(client)
    h, u = register_user(client, "sc14", "辰")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    r = client.get(f"/api/raids/{rid}/signups/{u['id']}/characters", headers=h)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["characters"]] == [c1]


def test_cancel_signup_clears_characters(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc15", "巳")
    c1 = _mkchar(client, h)
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    assert client.delete(f"/api/raids/{rid}/signup", headers=h).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1  # 仅剩团长固定行，无 500（验证 _remove_signup 改造）


def test_admin_signup_defaults_all(client):
    ah = _admin(client)
    h, u = register_user(client, "sc16", "午")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    assert client.post(f"/api/raids/{rid}/signups", headers=ah,
                       json={"user_id": u["id"]}).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], ah)) == sorted([c1, c2])


def test_admin_signup_no_character_target_rejected(client):
    ah = _admin(client)
    h, u = register_user(client, "sc17", "未")
    rid = make_raid(client, ah)["id"]
    r = client.post(f"/api/raids/{rid}/signups", headers=ah, json={"user_id": u["id"]})
    assert r.status_code == 400
    assert r.json()["detail"] == "至少选择一个角色"


def test_bot_signup_defaults_all(client):
    ah = _admin(client)
    h, u = register_user(client, "sc18", "申")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    bot = {"Authorization": "Bearer change-me-bot-token"}
    assert client.post(f"/api/public/raids/{rid}/signup", headers=bot,
                       json={"account": "sc18"}).status_code == 200
    assert sorted(_char_ids_of(client, rid, u["id"], ah)) == sorted([c1, c2])


def test_delete_character_clears_signup_rows(client):
    ah = _admin(client)
    h, u = register_user(client, "sc19", "酉")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    assert client.delete(f"/api/me/characters/{c1}", headers=h).status_code == 200
    assert _char_ids_of(client, rid, u["id"], h) == [c2]


def test_delete_character_empties_signup_cancels(client):
    ah = _admin(client)
    h, _ = register_user(client, "sc20", "戌")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1])
    assert client.delete(f"/api/me/characters/{c1}", headers=h).status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert len(detail["signups"]) == 1  # 报名因角色清空被整条取消


def test_remove_signup_character_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, _ = register_user(client, "scws1", "亥")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    slot = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]
    client.post(f"/api/raids/{rid}/slots/{slot['id']}/fill", headers=h,
                json={"character_id": c1})
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.delete(f"/api/raids/{rid}/signup/characters/{c1}",
                             headers=h).status_code == 200
        types = [ws.receive_json()["type"] for _ in range(2)]
        assert types == ["slot:removed", "raid:signup_chars_changed"]


def test_signup_ws_broadcast_includes_characters(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    h, _ = register_user(client, "scws2", "天")
    c1 = _mkchar(client, h)
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert _signup(client, rid, h).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:signup"
        assert [c["id"] for c in ev["characters"]] == [c1]


def test_admin_delete_character_clears_signup_rows(client):
    ah = _admin(client)
    h, u = register_user(client, "sc21", "戌")
    c1 = _mkchar(client, h, "C1")
    c2 = _mkchar(client, h, "C2")
    rid = make_raid(client, ah)["id"]
    _signup(client, rid, h, [c1, c2])
    r = client.delete(f"/api/admin/users/{u['id']}/characters/{c1}", headers=ah)
    assert r.status_code == 200
    assert _char_ids_of(client, rid, u["id"], ah) == [c2]
