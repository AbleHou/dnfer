from datetime import datetime

from sqlalchemy import Engine, text


def migrate_dungeons(engine: Engine) -> None:
    """为存量库补建副本预设与 raids.dungeon_id / starts_at（幂等）。

    说明：规格 §6 提及重建 raids 表；此处改用 ALTER ADD COLUMN + 应用层强制必填，
    避免外键约束（waves.raid_id）下重建表的复杂度，功能等价。
    """
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)  # 创建 dungeons 表（若缺）
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(raids)")).all()}
        if "dungeon_id" not in cols:
            conn.execute(text("ALTER TABLE raids ADD COLUMN dungeon_id INTEGER REFERENCES dungeons(id)"))
        if "starts_at" not in cols:
            conn.execute(text("ALTER TABLE raids ADD COLUMN starts_at DATETIME"))
        # 仅存量库才有 dungeon 文本列；新库（无该列）直接跳过回填，保证「无存量库仅建表、不报错」
        if "dungeon" in cols:
            names = [row[0] for row in conn.execute(text(
                "SELECT DISTINCT dungeon FROM raids WHERE dungeon IS NOT NULL AND dungeon <> ''")).all()]
            if conn.execute(text(
                    "SELECT COUNT(*) FROM raids WHERE dungeon IS NULL OR dungeon = ''")).scalar():
                names.append("未指定")
            for n in names:
                if not conn.execute(text("SELECT id FROM dungeons WHERE name = :n"),
                                    {"n": n}).scalar():
                    conn.execute(
                        text("INSERT INTO dungeons (name, size, description, created_at)"
                             " VALUES (:n, 12, '', :t)"),
                        {"n": n, "t": datetime.now()})
            conn.execute(text("""
                UPDATE raids SET dungeon_id = (
                    SELECT d.id FROM dungeons d
                    WHERE d.name = CASE WHEN raids.dungeon IS NULL OR raids.dungeon = ''
                                        THEN '未指定' ELSE raids.dungeon END
                ) WHERE dungeon_id IS NULL"""))
            # 遗留 dungeon 列是 NOT NULL 且新模型不再映射；不删除则 ORM 插入会 NOT NULL 失败
            conn.execute(text("ALTER TABLE raids DROP COLUMN dungeon"))
        conn.execute(text("UPDATE raids SET starts_at = created_at WHERE starts_at IS NULL"))


def migrate_avatars(engine: Engine) -> None:
    """为存量库补建 users.avatar 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).all()}
        if "avatar" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar VARCHAR(256)"))


def migrate_jobs(engine: Engine) -> None:
    """为存量库补建 characters.job_name，并清空存量角色与占位（幂等）。

    清空仅发生在「本次新增 job_name 列」时（存量库首次迁移）：
    必须先清 slots 占位再删 characters——SQLite 已启用 PRAGMA foreign_keys=ON，
    Slot.character_id 外键无 ON DELETE 动作，先删角色会触发外键约束错误。
    """
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(characters)")).all()}
        if "job_name" not in cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN job_name VARCHAR(64)"))
            conn.execute(text("UPDATE slots SET character_id = NULL, duty = NULL, "
                              "version = version + 1, updated_by = NULL, updated_at = NULL"))
            conn.execute(text("DELETE FROM characters"))


def migrate_users_ban(engine: Engine) -> None:
    """为存量库补建 users.is_banned 列（幂等）。"""
    from . import models  # noqa: F401  确保模型注册
    from .db import Base

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).all()}
        if "is_banned" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT 0"))


if __name__ == "__main__":
    from .db import engine
    migrate_dungeons(engine)
    print("dungeons 迁移完成")
