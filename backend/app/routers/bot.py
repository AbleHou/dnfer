import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..auth import hash_password, require_api_token
from ..db import get_db
from ..models import Character, RaidSignup, User
from ..schemas import (BotCharacterList, BotCharacterResult, BotCharactersIn,
                       BotCharactersOut, BotRegisterIn, BotSignupIn, UserOut)
from ..routers.raids import _raid_or_404, _remove_signup
from ..services.characters import character_out
from ..ws import manager

router = APIRouter(prefix="/api/public", tags=["bot"],
                   dependencies=[Depends(require_api_token)])

DEFAULT_JOB = "weapon_master"   # 极诣·剑魂
DEFAULT_FAME = 100000

_QQ_RE = re.compile(r"^\d{6,64}$")

def _get_user(db: Session, account: str | None = None,
              nickname: str | None = None) -> User:
    if account is not None:
        user = db.scalars(select(User).where(User.username == account)).first()
    else:
        users = db.scalars(select(User).where(User.nickname == nickname)).all()
        if len(users) > 1:  # 防御：昵称唯一被破坏（正常不应发生）
            raise HTTPException(500, "昵称重复，数据异常")
        user = users[0] if users else None
    if user is None:
        raise HTTPException(404, "账号或昵称不存在")
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
    user = _get_user(db, body.account, body.nickname)
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
                                              character=character_out(c)))
        else:
            seen[item.name] = c
            _apply_partial(c, item)
            results.append(BotCharacterResult(name=item.name, ok=True, action="updated",
                                              character=character_out(c)))
    db.commit()
    return BotCharactersOut(account=user.username, nickname=user.nickname,
                            results=results)

@router.get("/characters", response_model=BotCharacterList)
def list_characters(account: str | None = None, nickname: str | None = None,
                    db: Session = Depends(get_db)):
    if (account is None) == (nickname is None):
        raise HTTPException(400, "account 与 nickname 必须二选一")
    user = _get_user(db, account, nickname)
    chars = db.scalars(select(Character).where(Character.user_id == user.id)
                       .order_by(Character.id)).all()
    return BotCharacterList(account=user.username, nickname=user.nickname,
                            characters=[character_out(c) for c in chars])

@router.post("/register")
def register(body: BotRegisterIn, db: Session = Depends(get_db)):
    """按 QQ 号免码注册：账号=密码=昵称=QQ号。网页端注册仍走注册码。"""
    identifier = body.identifier
    if _QQ_RE.fullmatch(identifier) is None:
        raise HTTPException(400, "QQ号仅支持 6-64 位纯数字")
    if db.scalars(select(User).where(User.username == identifier)).first():
        raise HTTPException(400, "用户名已存在")
    if db.scalars(select(User).where(User.nickname == identifier)).first():
        raise HTTPException(400, "昵称已存在")
    user = User(username=identifier, password_hash=hash_password(identifier),
                nickname=identifier, is_admin=False)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "用户名已存在")
    return {"account": identifier, "nickname": identifier}

@router.post("/raids/{rid}/signup")
async def bot_signup(rid: int, body: BotSignupIn, db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    user = _get_user(db, body.account, body.nickname)
    if user.is_banned:
        raise HTTPException(403, "该用户已被封禁")
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first():
        raise HTTPException(400, "该用户已报名")
    rs = RaidSignup(raid_id=rid, user_id=user.id)
    db.add(rs)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "该用户已报名")
    db.refresh(rs)
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(user).model_dump(),
                                  "created_at": rs.created_at.isoformat()})
    return {"ok": True,
            "user": UserOut.model_validate(user).model_dump(),
            "raid": {"id": raid.id, "name": raid.name,
                     "starts_at": raid.starts_at.isoformat()}}

@router.post("/raids/{rid}/signup/cancel")
async def bot_cancel_signup(rid: int, body: BotSignupIn, db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    user = _get_user(db, body.account, body.nickname)
    if raid.locked:
        raise HTTPException(403, "攻坚已锁定，无法取消报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first() is None:
        raise HTTPException(400, "该用户尚未报名")
    await _remove_signup(db, raid, user.id)
    return {"ok": True,
            "user": UserOut.model_validate(user).model_dump(),
            "raid": {"id": raid.id, "name": raid.name,
                     "starts_at": raid.starts_at.isoformat()}}
