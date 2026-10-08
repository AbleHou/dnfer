from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSlackRule, User


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
