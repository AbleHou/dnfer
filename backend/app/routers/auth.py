from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import (consume_code, create_access_token, get_current_user,
                    hash_password, make_code, require_admin, verify_password)
from ..config import settings
from ..db import get_db
from ..models import RegistrationCode, User
from ..schemas import CodeCreate, CodeOut, LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/api", tags=["auth"])

@router.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "用户名已存在")
    rc = consume_code(db, body.code)
    user = User(username=body.username, password_hash=hash_password(body.password),
                nickname=body.nickname, is_admin=False)
    db.add(user)
    db.flush()
    if rc.single_use:
        rc.used_by = user.id
        rc.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}

@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "用户名或密码错误")
    return {"token": create_access_token(user.id), "user": UserOut.model_validate(user)}

@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)

@router.post("/admin/codes", response_model=CodeOut)
def create_code(body: CodeCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rc = make_code(db, admin, body.single_use, body.expire_days)
    db.commit()
    db.refresh(rc)
    return rc

@router.get("/admin/codes", response_model=list[CodeOut])
def list_codes(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(RegistrationCode).order_by(RegistrationCode.id.desc()).limit(100).all()

@router.get("/admin/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(User).all()
