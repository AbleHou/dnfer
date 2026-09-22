from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Dungeon, Raid, RaidSignup, User


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_raid_signup_model_roundtrip_unique_cascade(db):
    admin = db.query(User).filter(User.username == "admin").one()
    d = Dungeon(name="副本", size=12)
    db.add(d)
    db.flush()
    r = Raid(name="x", dungeon_id=d.id, size=12, locked=False,
             starts_at=_now(), created_by=admin.id)
    db.add(r)
    db.flush()
    u = User(username="u1", password_hash="x", nickname="甲", is_admin=False)
    db.add(u)
    db.flush()

    db.add(RaidSignup(raid_id=r.id, user_id=u.id))
    db.commit()
    assert db.query(RaidSignup).count() == 1

    # 同 raid+user 唯一
    db.add(RaidSignup(raid_id=r.id, user_id=u.id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 删团级联清 signups（Raid.signups cascade="all, delete-orphan"）
    r = db.get(Raid, r.id)
    db.delete(r)
    db.commit()
    assert db.query(RaidSignup).count() == 0
