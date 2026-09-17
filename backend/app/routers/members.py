from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..auth import get_current_user
from ..db import get_db
from ..models import Character, Slot, User
from ..schemas import CharacterIn, CharacterOut

router = APIRouter(prefix="/api/me/characters", tags=["members"])

def _character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount)

def _validate_job(body: CharacterIn) -> None:
    if job_data.job_meta(body.job_name) is None:
        raise HTTPException(400, "职业不存在")

@router.get("", response_model=list[CharacterOut])
def list_characters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chars = db.scalars(
        select(Character).where(Character.user_id == user.id).order_by(Character.id)
    ).all()
    return [_character_out(c) for c in chars]

@router.post("", response_model=CharacterOut)
def create_character(body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    _validate_job(body)
    c = Character(user_id=user.id, name=body.name, job_name=body.job_name,
                  class_type=job_data.class_type_for(body.job_name), fame=body.fame,
                  simulated_damage=body.simulated_damage,
                  sustained_dps=body.sustained_dps, buff_amount=body.buff_amount)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _character_out(c)

def _own_character(db: Session, cid: int, user: User) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "角色不存在")
    return c

@router.put("/{cid}", response_model=CharacterOut)
def update_character(cid: int, body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    _validate_job(body)
    c.name = body.name
    c.job_name = body.job_name
    c.class_type = job_data.class_type_for(body.job_name)
    c.fame = body.fame
    c.simulated_damage = body.simulated_damage
    c.sustained_dps = body.sustained_dps
    c.buff_amount = body.buff_amount
    db.commit()
    db.refresh(c)
    return _character_out(c)

@router.delete("/{cid}")
def delete_character(cid: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    in_use = db.query(Slot).filter(Slot.character_id == cid).first()
    if in_use:
        raise HTTPException(400, "该角色正在攻坚中，请先撤下")
    db.delete(c)
    db.commit()
    return {"ok": True}
