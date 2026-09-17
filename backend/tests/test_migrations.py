from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.migrations import migrate_dungeons
from app.models import Raid

def test_migrate_legacy_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE raids (
            id INTEGER PRIMARY KEY, name VARCHAR(128), dungeon VARCHAR(64),
            size INTEGER, locked BOOLEAN, created_by INTEGER, created_at DATETIME)"""))
        conn.execute(text("""INSERT INTO raids (name, dungeon, size, locked, created_by, created_at)
            VALUES ('攻坚1', '巴卡尔', 12, 0, 1, '2026-09-01 10:00:00')"""))
        conn.execute(text("""INSERT INTO raids (name, dungeon, size, locked, created_by, created_at)
            VALUES ('攻坚2', '', 12, 0, 1, '2026-09-02 10:00:00')"""))
    migrate_dungeons(engine)
    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT name, dungeon_id, starts_at FROM raids ORDER BY id")).all()
        assert rows[0].dungeon_id is not None and rows[0].starts_at is not None
        assert rows[1].dungeon_id is not None
        names = [r[0] for r in conn.execute(text("SELECT name FROM dungeons")).all()]
        assert "巴卡尔" in names and "未指定" in names
    migrate_dungeons(engine)  # 幂等
    # 迁移后 ORM 插入新攻坚应成功：遗留 dungeon NOT NULL 列已移除
    Session = sessionmaker(bind=engine)
    with Session() as s:
        s.add(Raid(name="新攻坚", dungeon_id=1, size=12,
                   starts_at=datetime(2026, 9, 3, 10, 0), created_by=1))
        s.commit()
