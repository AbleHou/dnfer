from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..auth import require_api_token
from ..db import get_db
from ..models import Character, User
from ..schemas import (BotCharacterList, BotCharacterResult, BotCharactersIn,
                       BotCharactersOut)
from .members import _character_out

router = APIRouter(prefix="/api/public", tags=["bot"],
                   dependencies=[Depends(require_api_token)])

DEFAULT_JOB = "weapon_master"   # 极诣·剑魂
DEFAULT_FAME = 100000

def _get_user(db: Session, account: str) -> User:
    user = db.scalars(select(User).where(User.username == account)).first()
    if user is None:
        raise HTTPException(404, "账号不存在")
    return user

def _apply_partial(c: Character, body: "BotCharacterIn") -> None:
    """编辑（同名已存在）：仅写入本次提供（非 None）的字段，缺失保留原值。"""
    if body.job_name is not None:
        c.job_name = body.job_name
        c.class_type = job_data.class_type_for(body.job_name)
    if body.fame is not None:
        c.fame = body.fame
    if body.simulated_damage is not None:
        c.simulated_damage = body.simulated_damage
    if body.sustained_dps is not None:
        c.sustained_dps = body.sustained_dps
    if body.buff_amount is not None:
        c.buff_amount = body.buff_amount

@router.post("/characters", response_model=BotCharactersOut)
def upsert_characters(body: BotCharactersIn, db: Session = Depends(get_db)):
    user = _get_user(db, body.account)
    seen: dict[str, Character] = {}
    results: list[BotCharacterResult] = []
    for item in body.characters:
        if item.job_name is not None and job_data.job_meta(item.job_name) is None:
            results.append(BotCharacterResult(name=item.name, ok=False, error="职业不存在"))
            continue
        c = seen.get(item.name)
        if c is None:
            c = db.scalars(select(Character).where(
                Character.user_id == user.id, Character.name == item.name)).first()
        if c is None:
            job = item.job_name or DEFAULT_JOB
            c = Character(user_id=user.id, name=item.name, job_name=job,
                          class_type=job_data.class_type_for(job),
                          fame=item.fame if item.fame is not None else DEFAULT_FAME,
                          simulated_damage=item.simulated_damage,
                          sustained_dps=item.sustained_dps, buff_amount=item.buff_amount)
            db.add(c)
            db.flush()
            seen[item.name] = c
            results.append(BotCharacterResult(name=item.name, ok=True, action="created",
                                              character=_character_out(c)))
        else:
            seen[item.name] = c
            _apply_partial(c, item)
            results.append(BotCharacterResult(name=item.name, ok=True, action="updated",
                                              character=_character_out(c)))
    db.commit()
    return BotCharactersOut(account=body.account, results=results)

@router.get("/characters", response_model=BotCharacterList)
def list_characters(account: str, db: Session = Depends(get_db)):
    user = _get_user(db, account)
    chars = db.scalars(select(Character).where(Character.user_id == user.id)
                       .order_by(Character.id)).all()
    return BotCharacterList(account=account, nickname=user.nickname,
                            characters=[_character_out(c) for c in chars])
