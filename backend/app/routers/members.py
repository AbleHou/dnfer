from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Character, User
from ..schemas import CharacterIn, CharacterOut
from ..services.characters import (apply_character_payload, character_out,
                                   delete_character_if_free, validate_job)

router = APIRouter(prefix="/api/me/characters", tags=["members"])

@router.get("", response_model=list[CharacterOut])
def list_characters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chars = db.scalars(
        select(Character).where(Character.user_id == user.id).order_by(Character.id)
    ).all()
    return [character_out(c) for c in chars]

@router.post("", response_model=CharacterOut)
def create_character(body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    validate_job(body.job_name)
    c = Character(user_id=user.id)
    apply_character_payload(c, body)
    db.add(c)
    db.commit()
    db.refresh(c)
    return character_out(c)

def _own_character(db: Session, cid: int, user: User) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "角色不存在")
    return c

@router.put("/{cid}", response_model=CharacterOut)
def update_character(cid: int, body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    validate_job(body.job_name)
    apply_character_payload(c, body)
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.delete("/{cid}")
def delete_character(cid: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    delete_character_if_free(db, cid)
    db.delete(c)
    db.commit()
    return {"ok": True}
