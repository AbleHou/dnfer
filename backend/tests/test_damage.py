"""compute_combat_power 公式纯函数单测（零依赖，无需 fixtures）。"""
from app.services.damage import compute_combat_power


def test_compute_applies_buffs_and_percent():
    # 三攻=10000 力智=5000 属强=300 攻强=100(100%) 攻强增幅=20(20%) 技攻=50(50%)
    # 副本: 三攻=50000 力智=225000 → 50000*901*2.4*2.2*1.5 / 1e6 = 357
    assert compute_combat_power(10000, 5000, 300, 100, 20, 50) == 357


def test_compute_zero_own_stats_only_buffs():
    # 三攻=40000 力智=220000 → 40000*881*1.05 / 1e6 = 37
    assert compute_combat_power(0, 0, 0, 0, 0, 0) == 37


def test_compute_any_none_returns_none():
    assert compute_combat_power(None, 5000, 300, 100, 20, 50) is None
    assert compute_combat_power(10000, None, 300, 100, 20, 50) is None
    assert compute_combat_power(10000, 5000, 300, 100, None, 50) is None


from .helpers import register_user

def test_character_damage_save_roundtrip(client):
    h, _ = register_user(client, "dmg1", "阿伟")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 20000,
        "simulated_damage": 680000, "sustained_dps": 420000,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50})
    assert r.status_code == 200
    body = r.json()
    assert body["combat_power"] == 357
    assert body["atk_base"] == 10000
    assert body["skill_atk"] == 50
    # 编辑清空某输入 → combat_power 变 None
    cid = body["id"]
    r2 = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 20000,
        "simulated_damage": 680000, "sustained_dps": 420000,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": None, "skill_atk": 50})
    assert r2.status_code == 200
    assert r2.json()["combat_power"] is None

def test_output_to_support_clears_damage_fields(client):
    h, _ = register_user(client, "dmg2", "转职")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}).json()["id"]
    r = client.put(f"/api/me/characters/{cid}", headers=h, json={
        "name": "剑魂", "job_name": "crusader_male", "fame": 1, "buff_amount": 9000})
    assert r.status_code == 200
    body = r.json()
    assert body["class_type"] == "辅助"
    assert body["combat_power"] is None
    assert body["atk_base"] is None and body["skill_atk"] is None

def test_support_character_ignores_damage_fields(client):
    h, _ = register_user(client, "dmg3", "奶")
    r = client.post("/api/me/characters", headers=h, json={
        "name": "小魔女", "job_name": "enchantress", "fame": 1,
        "buff_amount": 9000, "atk_base": 10000, "skill_atk": 50})
    body = r.json()
    assert body["class_type"] == "辅助"
    assert body["combat_power"] is None and body["atk_base"] is None

def test_bot_update_keeps_damage_fields(client):
    h, _ = register_user(client, "dmg4", "阿伟")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}).json()["id"]
    # bot 按账号更新同名角色（部分字段），不带伤害字段 → 不清空
    # /api/public/* 需要 bot API token（conftest 种入 change-me-bot-token）
    bot_h = {"Authorization": "Bearer change-me-bot-token"}
    r = client.post("/api/public/characters", headers=bot_h, json={
        "account": "dmg4", "characters": [{"name": "剑魂", "fame": 2000}]})
    assert r.status_code == 200
    assert r.json()["results"][0]["ok"] is True
    got = client.get("/api/me/characters", headers=h).json()[0]
    assert got["combat_power"] == 357
    assert got["atk_base"] == 10000

def test_slot_out_carries_combat_power(client):
    from .helpers import make_dungeon, make_raid, signup
    h, _ = register_user(client, "dmg5", "阿伟")
    ah = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username':'admin','password':'admin123'}).json()['token']}"}
    d = make_dungeon(client, ah)["id"]
    rid = make_raid(client, ah, dungeon_id=d)["id"]
    # 先建角色再 signup：signup 默认勾选全部角色，角色为空会 400「至少选择一个角色」
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 1,
        "atk_base": 10000, "str_int": 5000, "elemental": 300,
        "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}).json()["id"]
    signup(client, rid, h)
    slot_id = client.get(f"/api/raids/{rid}", headers=h).json()["waves"][0]["slots"][0]["id"]
    r = client.post(f"/api/raids/{rid}/slots/{slot_id}/fill", headers=h,
                    json={"character_id": cid})
    assert r.status_code == 200
    slot = r.json()["slot"]
    assert slot["combat_power"] == 357

def test_guest_create_character_computes_combat_power(client):
    ah = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'username':'admin','password':'admin123'}).json()['token']}"}
    r = client.post("/api/admin/users", headers=ah, json={
        "nickname": "临时", "characters": [{
            "name": "剑魂", "job_name": "weapon_master", "fame": 1,
            "atk_base": 10000, "str_int": 5000, "elemental": 300,
            "atk_power": 100, "atk_power_amp": 20, "skill_atk": 50}]})
    assert r.status_code == 200
    chars = r.json()["characters"]
    assert chars[0]["combat_power"] == 357
