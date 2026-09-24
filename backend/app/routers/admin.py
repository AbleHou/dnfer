from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, contains_eager

from ..auth import make_code, require_admin
from ..db import get_db
from ..models import Character, RegistrationCode, User
from ..schemas import (AdminCharacterRow, AdminUserOut, CharacterIn, CharacterOut,
                       CharacterQueryResult, CodeCreate, CodeOut, PlayerCharacters,
                       UserOut)
from ..services.characters import (apply_character_payload, character_out,
                                   delete_character_if_free, validate_job)

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.post("/codes", response_model=CodeOut)
def create_code(body: CodeCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rc = make_code(db, admin, body.single_use, body.expire_days)
    db.commit()
    db.refresh(rc)
    return rc

@router.get("/codes", response_model=list[CodeOut])
def list_codes(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(RegistrationCode).order_by(RegistrationCode.id.desc()).limit(100).all()

def _counts(db: Session) -> dict[int, int]:
    return dict(db.query(Character.user_id, func.count(Character.id))
                .group_by(Character.user_id).all())

@router.get("/users", response_model=list[AdminUserOut])
def list_users(q: str | None = None, admin: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    query = db.query(User)
    if q:
        query = query.filter(or_(User.nickname.contains(q), User.username.contains(q)))
    users = query.order_by(User.nickname).all()
    counts = _counts(db)
    return [AdminUserOut(character_count=counts.get(u.id, 0),
                         **UserOut.model_validate(u).model_dump()) for u in users]

@router.get("/characters", response_model=list[PlayerCharacters])
def list_all_characters(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    result = []
    for u in db.scalars(select(User).order_by(User.nickname)).all():
        chars = db.scalars(select(Character).where(Character.user_id == u.id)
                           .order_by(Character.id)).all()
        if not chars:
            continue
        result.append(PlayerCharacters(user=UserOut.model_validate(u),
                                       characters=[character_out(c) for c in chars]))
    return result

_SORT_COLS = {
    "fame": Character.fame,
    "simulated_damage": Character.simulated_damage,
    "sustained_dps": Character.sustained_dps,
    "buff_amount": Character.buff_amount,
    "name": Character.name,
}

@router.get("/characters/query", response_model=CharacterQueryResult)
def query_characters(
    job_name: str | None = None,
    class_type: str | None = None,
    keyword: str | None = None,
    owner: str | None = None,
    sort: str = "fame",
    order: str = "desc",
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin), db: Session = Depends(get_db),
):
    sort = sort or "fame"
    order = order or "desc"
    if sort not in _SORT_COLS or order not in ("asc", "desc"):
        raise HTTPException(400, "排序参数无效")
    if class_type and class_type not in ("输出", "辅助"):
        raise HTTPException(400, "职业类别无效")
    q = db.query(Character).join(Character.owner).options(contains_eager(Character.owner))
    if job_name:
        q = q.filter(Character.job_name == job_name)
    if class_type:
        q = q.filter(Character.class_type == class_type)
    if keyword:
        q = q.filter(Character.name.contains(keyword))
    if owner:
        q = q.filter(or_(User.nickname.contains(owner), User.username.contains(owner)))
    total = q.count()
    col = _SORT_COLS[sort]
    expr = col.asc() if order == "asc" else col.desc()
    if col is not Character.name:
        expr = expr.nulls_last()
    rows = q.order_by(expr, Character.id.asc()).offset(offset).limit(limit).all()
    items = [
        AdminCharacterRow(**character_out(c).model_dump(),
                          owner_id=c.owner.id, owner_nickname=c.owner.nickname,
                          owner_username=c.owner.username, owner_is_banned=c.owner.is_banned)
        for c in rows
    ]
    return CharacterQueryResult(items=items, total=total)

def _user_or_404(db: Session, uid: int) -> User:
    u = db.get(User, uid)
    if u is None:
        raise HTTPException(404, "用户不存在")
    return u

def _user_character_or_404(db: Session, uid: int, cid: int) -> Character:
    c = db.get(Character, cid)
    if c is None or c.user_id != uid:
        raise HTTPException(404, "角色不存在")
    return c

@router.get("/users/{uid}/characters", response_model=list[CharacterOut])
def list_user_characters(uid: int, admin: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    _user_or_404(db, uid)
    chars = db.query(Character).filter(Character.user_id == uid).order_by(Character.id).all()
    return [character_out(c) for c in chars]

@router.post("/users/{uid}/characters", response_model=CharacterOut)
def create_user_character(uid: int, body: CharacterIn, admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    _user_or_404(db, uid)
    validate_job(body.job_name)
    c = Character(user_id=uid)
    apply_character_payload(c, body)
    db.add(c)
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.put("/users/{uid}/characters/{cid}", response_model=CharacterOut)
def update_user_character(uid: int, cid: int, body: CharacterIn,
                          admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _user_character_or_404(db, uid, cid)
    validate_job(body.job_name)
    apply_character_payload(c, body)
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.delete("/users/{uid}/characters/{cid}")
def delete_user_character(uid: int, cid: int, admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    c = _user_character_or_404(db, uid, cid)
    delete_character_if_free(db, cid)
    db.delete(c)
    db.commit()
    return {"ok": True}

def _admin_user_out(db: Session, target: User) -> AdminUserOut:
    return AdminUserOut(character_count=db.query(Character)
                        .filter(Character.user_id == target.id).count(),
                        **UserOut.model_validate(target).model_dump())

@router.post("/users/{uid}/ban", response_model=AdminUserOut)
def ban_user(uid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    if target.id == admin.id:
        raise HTTPException(403, "不能封禁自己")
    if target.is_admin:
        raise HTTPException(403, "不能封禁管理员")
    target.is_banned = True
    db.commit()
    db.refresh(target)
    return _admin_user_out(db, target)

@router.post("/users/{uid}/unban", response_model=AdminUserOut)
def unban_user(uid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    target = _user_or_404(db, uid)
    target.is_banned = False
    db.commit()
    db.refresh(target)
    return _admin_user_out(db, target)
