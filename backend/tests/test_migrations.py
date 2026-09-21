from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.migrations import migrate_dungeons
from app.models import Raid

def test_migrate_legacy_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE raids (
            id INTEGER PRIMARY KEY, name VARCHAR(128), dungeon VARCHAR(64) NOT NULL,
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

def test_migrate_jobs_wipes_legacy_characters():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE characters (
            id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(64),
            class_type VARCHAR(8), fame INTEGER, simulated_damage INTEGER,
            sustained_dps INTEGER, buff_amount INTEGER)"""))
        conn.execute(text("""CREATE TABLE slots (
            id INTEGER PRIMARY KEY, wave_id INTEGER, squad_index INTEGER,
            row_index INTEGER, character_id INTEGER, duty VARCHAR(16), version INTEGER,
            updated_by INTEGER, updated_at DATETIME)"""))
        conn.execute(text("""INSERT INTO characters (user_id, name, class_type, fame)
            VALUES (1, '剑魂', '输出', 10000)"""))
        conn.execute(text("""INSERT INTO slots (wave_id, squad_index, row_index,
            character_id, duty, version) VALUES (1, 0, 0, 1, '主C', 0)"""))
    from app.migrations import migrate_jobs
    migrate_jobs(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(characters)")).all()}
        assert "job_name" in cols
        assert conn.execute(text("SELECT COUNT(*) FROM characters")).scalar() == 0
        slot = conn.execute(text("SELECT character_id, duty FROM slots")).fetchone()
        assert slot[0] is None and slot[1] is None
    migrate_jobs(engine)  # 幂等：再次运行不报错、不重复清空

def test_migrate_avatars_adds_column():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("""CREATE TABLE users (
            id INTEGER PRIMARY KEY, username VARCHAR(64) UNIQUE,
            password_hash VARCHAR(128), nickname VARCHAR(64),
            is_admin BOOLEAN, created_at DATETIME)"""))
    from app.migrations import migrate_avatars
    migrate_avatars(engine)
    with engine.begin() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).all()}
        assert "avatar" in cols
    migrate_avatars(engine)  # 幂等：再次运行不报错
