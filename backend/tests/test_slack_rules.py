from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSlackRule, User
from app.schemas import SlackRuleCriterion, SlackRuleExchange, SlackRuleSet

from .helpers import make_raid, register_user, signup


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_slack_rule_model_roundtrip_unique_cascade(db):
    admin = db.query(User).filter(User.username == "admin").one()
    d = Dungeon(name="副本", size=12)
    db.add(d)
    db.flush()
    r = Raid(name="x", dungeon_id=d.id, size=12, locked=False,
             starts_at=_now(), created_by=admin.id)
    db.add(r)
    db.flush()

    db.add(RaidSlackRule(raid_id=r.id, rules={"criteria": [], "exchange": []}))
    db.commit()
    assert db.query(RaidSlackRule).count() == 1

    # 同 raid 唯一
    db.add(RaidSlackRule(raid_id=r.id, rules={"criteria": [], "exchange": []}))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 删团级联清规则
    db.delete(db.get(Raid, r.id))
    db.commit()
    assert db.query(RaidSlackRule).count() == 0


def test_slack_rule_set_metric_compatibility():
    # 输出职业不能选辅助指标
    with pytest.raises(ValidationError):
        SlackRuleSet(criteria=[SlackRuleCriterion(class_type="输出", metric="buff_amount", value=100)])
    # 辅助职业不能选输出指标
    with pytest.raises(ValidationError):
        SlackRuleSet(exchange=[SlackRuleExchange(class_type="辅助", metric="fame", value=1, count=1)])
    # 合法：输出用秒伤 + 辅助用增益量
    s = SlackRuleSet(
        criteria=[SlackRuleCriterion(class_type="输出", metric="sustained_dps", value=50)],
        exchange=[SlackRuleExchange(class_type="辅助", metric="buff_amount", value=40000, count=1)])
    assert len(s.criteria) == 1 and len(s.exchange) == 1


def _admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _rules():
    return {
        "criteria": [{"class_type": "输出", "metric": "fame", "value": 125000},
                     {"class_type": "辅助", "metric": "buff_amount", "value": 40000}],
        "exchange": [{"class_type": "输出", "metric": "fame", "value": 130000, "count": 1},
                     {"class_type": "输出", "metric": "fame", "value": 141000, "count": 3}],
    }


def test_set_slack_rules_requires_admin(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    h, _ = register_user(client, "sru1", "甲")
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=h, json=_rules())
    assert r.status_code == 403


def test_set_and_read_slack_rules(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json=_rules())
    assert r.status_code == 200
    assert r.json() == _rules()
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert detail["slack_rules"] == _rules()


def test_set_empty_slack_rules_clears(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json=_rules())
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=ah,
                   json={"criteria": [], "exchange": []})
    assert r.status_code == 200
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    assert detail["slack_rules"] == {"criteria": [], "exchange": []}


def test_set_slack_rules_rejects_incompatible_metric(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    r = client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json={
        "criteria": [{"class_type": "输出", "metric": "buff_amount", "value": 100}],
        "exchange": []})
    assert r.status_code == 422


def test_set_slack_rules_ws_broadcast(client):
    ah = _admin(client)
    token = ah["Authorization"].split()[1]
    rid = make_raid(client, ah)["id"]
    with client.websocket_connect(f"/ws/raids/{rid}?token={token}") as ws:
        assert client.put(f"/api/raids/{rid}/slack-rules", headers=ah, json=_rules()).status_code == 200
        ev = ws.receive_json()
        assert ev["type"] == "raid:slack_rules_changed"
        assert ev["slack_rules"]["criteria"][0]["value"] == 125000


def test_detail_signup_characters_full_and_leader_filled(client):
    ah = _admin(client)
    rid = make_raid(client, ah)["id"]
    admin_char = client.post("/api/me/characters", headers=ah, json={
        "name": "团长角色", "job_name": "weapon_master", "fame": 52000,
        "simulated_damage": 5}).json()["id"]
    h, _ = register_user(client, "srd2", "乙")
    cid = client.post("/api/me/characters", headers=h, json={
        "name": "剑魂", "job_name": "weapon_master", "fame": 100000,
        "sustained_dps": 30}).json()["id"]
    signup(client, rid, h)
    detail = client.get(f"/api/raids/{rid}", headers=ah).json()
    # 团长行填充全部角色（含数值）
    leader = detail["signups"][0]
    assert leader["created_at"] is None
    assert [c["id"] for c in leader["characters"]] == [admin_char]
    assert leader["characters"][0]["fame"] == 52000
    # 成员行角色为完整 CharacterOut（含数值）
    member = detail["signups"][1]
    assert [c["id"] for c in member["characters"]] == [cid]
    assert member["characters"][0]["sustained_dps"] == 30
