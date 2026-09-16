from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_api_token
from ..db import get_db
from ..models import Raid, Wave
from ..schemas import RaidListItem
from ..routers.raids import _detail

router = APIRouter(prefix="/api/public", tags=["public"],
                   dependencies=[Depends(require_api_token)])

@router.get("/raids", response_model=list[RaidListItem])
def public_raids(db: Session = Depends(get_db)):
    return [RaidListItem(id=r.id, name=r.name, dungeon=r.dungeon, size=r.size,
                         locked=r.locked, wave_count=len(r.waves))
            for r in db.query(Raid).order_by(Raid.created_at.desc()).all()]

@router.get("/raids/{rid}/waves/{index}")
def public_wave(rid: int, index: int, db: Session = Depends(get_db)):
    raid = db.get(Raid, rid)
    if raid is None:
        raise HTTPException(404, "攻坚不存在")
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    detail = _detail(db, raid)
    for w in detail.waves:
        if w.index == index:
            return w
    raise HTTPException(404, "波次不存在")
