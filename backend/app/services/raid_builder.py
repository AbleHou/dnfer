from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Dungeon, Raid, Slot, Wave

LEGAL_SIZES = {4, 8, 12, 16, 20}
SQUAD_PALETTE = ["红", "黄", "绿", "蓝", "紫"]

def validate_size(size: int) -> None:
    if size not in LEGAL_SIZES:
        raise ValueError("规模必须是 4/8/12/16/20")

def create_raid(db: Session, name: str, dungeon: Dungeon, starts_at: datetime,
                created_by: int) -> Raid:
    raid = Raid(name=name, dungeon_id=dungeon.id, size=dungeon.size,
                starts_at=starts_at, created_by=created_by)
    db.add(raid)
    db.flush()
    create_wave(db, raid)
    return raid

def create_wave(db: Session, raid: Raid) -> Wave:
    max_index = db.query(Wave.index).filter(Wave.raid_id == raid.id).order_by(Wave.index.desc()).first()
    index = (max_index[0] + 1) if max_index else 1
    wave = Wave(raid_id=raid.id, index=index)
    db.add(wave)
    db.flush()
    squads = raid.size // 4
    for sq in range(squads):
        for row in range(4):
            db.add(Slot(wave_id=wave.id, squad_index=sq, row_index=row))
    db.flush()
    return wave

def squad_color(squad_index: int, palette: list[str] | None = None) -> str:
    return (palette or SQUAD_PALETTE)[squad_index % len(palette or SQUAD_PALETTE)]
