from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..db import get_db
from ..models import Dungeon, Raid
from ..schemas import DungeonIn, DungeonOut
from ..services.raid_builder import validate_size

router = APIRouter(prefix="/api/dungeons", tags=["dungeons"])

@router.get("", response_model=list[DungeonOut])
def list_dungeons(admin=Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(Dungeon).order_by(Dungeon.created_at.asc()).all()

@router.post("", response_model=DungeonOut)
def create_dungeon(body: DungeonIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    try:
        validate_size(body.size)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if db.query(Dungeon).filter(Dungeon.name == body.name).first():
        raise HTTPException(400, "副本名已存在")
    d = Dungeon(name=body.name, size=body.size, description=body.description)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d

@router.put("/{did}", response_model=DungeonOut)
def update_dungeon(did: int, body: DungeonIn, admin=Depends(require_admin),
                   db: Session = Depends(get_db)):
    d = db.get(Dungeon, did)
    if d is None:
        raise HTTPException(404, "副本不存在")
    try:
        validate_size(body.size)
    except ValueError as e:
        raise HTTPException(400, str(e))
    dup = db.query(Dungeon).filter(Dungeon.name == body.name, Dungeon.id != did).first()
    if dup:
        raise HTTPException(400, "副本名已存在")
    d.name = body.name
    d.size = body.size
    d.description = body.description
    db.commit()
    db.refresh(d)
    return d

@router.delete("/{did}")
def delete_dungeon(did: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    d = db.get(Dungeon, did)
    if d is None:
        raise HTTPException(404, "副本不存在")
    if db.query(Raid).filter(Raid.dungeon_id == did).first():
        raise HTTPException(400, "该副本已有攻坚记录，无法删除")
    db.delete(d)
    db.commit()
    return {"ok": True}
