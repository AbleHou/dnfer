from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..auth import require_api_token
from ..db import get_db
from ..models import Raid, Wave
from ..schemas import RaidDetail, RaidListItem
from ..routers.raids import _detail

router = APIRouter(prefix="/api/public", tags=["public"],
                   dependencies=[Depends(require_api_token)])

@router.get("/raids", response_model=list[RaidListItem])
def public_raids(db: Session = Depends(get_db)):
    return [RaidListItem(id=r.id, name=r.name, dungeon_id=r.dungeon_id,
                         dungeon_name=r.dungeon.name, size=r.size,
                         locked=r.locked, starts_at=r.starts_at,
                         wave_count=len(r.waves),
                         signup_count=0, my_signed_up=False)
            for r in db.query(Raid).options(selectinload(Raid.dungeon))
                    .order_by(Raid.created_at.desc()).all()]

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

@router.get("/raids/{rid}", response_model=RaidDetail)
def public_raid(rid: int, db: Session = Depends(get_db)):
    raid = db.get(Raid, rid)
    if raid is None:
        raise HTTPException(404, "攻坚不存在")
    return _detail(db, raid)
