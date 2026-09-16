import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import RegistrationCode, User

_bearer = HTTPBearer(auto_error=False)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_access_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.secret_key, algorithm="HS256")

def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(401, "未登录")
    try:
        payload = jwt.decode(creds.credentials, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload.get("sub", ""))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise HTTPException(401, "登录已过期，请重新登录")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(401, "用户不存在")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "需要管理员权限")
    return user

def require_api_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "缺少 API Token")
    token = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, settings.api_token):
        raise HTTPException(401, "API Token 无效")

def make_code(db: Session, admin: User, single_use: bool, expire_days: int | None) -> RegistrationCode:
    code = secrets.token_hex(6)
    expires = None
    if expire_days:
        expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=expire_days)
    rc = RegistrationCode(code=code, created_by=admin.id, single_use=single_use, expires_at=expires)
    db.add(rc)
    return rc

def consume_code(db: Session, code: str) -> RegistrationCode:
    rc = db.query(RegistrationCode).filter(RegistrationCode.code == code).first()
    if rc is None:
        raise HTTPException(400, "注册码无效")
    if rc.used_by is not None:
        raise HTTPException(400, "注册码已被使用")
    if rc.expires_at and rc.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(400, "注册码已过期")
    return rc
