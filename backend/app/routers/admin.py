from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import make_code, require_admin
from ..db import get_db
from ..models import Character, RegistrationCode, User
from ..schemas import AdminUserOut, CodeCreate, CodeOut, PlayerCharacters, UserOut
from ..services.characters import character_out

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
