from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Character, Slot, User
from ..schemas import CharacterIn, CharacterOut

router = APIRouter(prefix="/api/me/characters", tags=["members"])

@router.get("", response_model=list[CharacterOut])
def list_characters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Character).where(Character.user_id == user.id)).all()

@router.post("", response_model=CharacterOut)
def create_character(body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = Character(user_id=user.id, **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

def _own_character(db: Session, cid: int, user: User) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "角色不存在")
    return c

@router.put("/{cid}", response_model=CharacterOut)
def update_character(cid: int, body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c

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
