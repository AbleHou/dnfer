from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import s3
from ..auth import (consume_code, create_access_token, get_current_user,
                    hash_password, make_code, require_admin, verify_password)
from ..config import settings
from ..db import get_db
from ..models import Character, RegistrationCode, User
from ..schemas import (CodeCreate, CodeOut, LoginIn, PlayerCharacters,
                       ProfileUpdate, RegisterIn, UserOut)
from .members import _character_out

router = APIRouter(prefix="/api", tags=["auth"])

@router.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "用户名已存在")
    if db.query(User).filter(User.nickname == body.nickname).first():
        raise HTTPException(400, "昵称已存在")
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

_AVATAR_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_AVATAR_BYTES = 2 * 1024 * 1024

@router.put("/me/profile", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    dup = db.query(User).filter(User.nickname == body.nickname,
                                User.id != user.id).first()
    if dup:
        raise HTTPException(400, "昵称已存在")
    user.nickname = body.nickname
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)

@router.post("/me/avatar", response_model=UserOut)
def upload_avatar(file: UploadFile = File(...),
                  user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    # 先做文件级校验（400），再判存储可用性（503）：
    # 未配置 S3 时非法文件仍应返回 400（测试依赖此顺序）
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "仅支持图片文件")
    data = file.file.read()
    if len(data) > _MAX_AVATAR_BYTES:
        raise HTTPException(400, "图片不能超过 2MB")
    if not s3.s3_configured():
        raise HTTPException(503, "头像存储未配置")
    ext = _AVATAR_EXT.get(file.content_type, "bin")
    try:
        url = s3.upload_avatar(user.id, ext, data,
                               file.content_type or "application/octet-stream")
    except Exception:
        raise HTTPException(503, "头像存储暂不可用")
    if user.avatar:
        s3.delete_avatar(user.avatar)
    user.avatar = url
    db.commit()
    db.refresh(user)
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

@router.get("/admin/characters", response_model=list[PlayerCharacters])
def list_all_characters(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    result = []
    for u in db.scalars(select(User).order_by(User.nickname)).all():
        chars = db.scalars(select(Character).where(Character.user_id == u.id)
                           .order_by(Character.id)).all()
        if not chars:
            continue  # 过滤无角色玩家
        result.append(PlayerCharacters(user=UserOut.model_validate(u),
                                       characters=[_character_out(c) for c in chars]))
    return result
