from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSlackRule, User
from app.schemas import SlackRuleCriterion, SlackRuleExchange, SlackRuleSet


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
