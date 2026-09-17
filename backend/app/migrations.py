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
        conn.execute(text("UPDATE raids SET starts_at = created_at WHERE starts_at IS NULL"))


if __name__ == "__main__":
    from .db import engine
    migrate_dungeons(engine)
    print("dungeons 迁移完成")
