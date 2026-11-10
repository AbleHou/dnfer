from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import s3
from ..auth import get_current_user
from ..db import get_db
from ..models import Character, User
from ..schemas import CharacterIn, CharacterOut
from ..services.characters import (apply_character_payload, character_out,
                                   delete_character_if_free, validate_job)
from ..services.images import detect_image, image_content_type
from ..services.parties import resolve_party

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
    c.adventure_party_id = resolve_party(db, user, body.adventure_party_id).id
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
    c.adventure_party_id = resolve_party(db, user, body.adventure_party_id).id
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

_PROFILE_EXT = {"image/png": "png", "image/apng": "png",
                "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_PROFILE_BYTES = 10 * 1024 * 1024

@router.post("/{cid}/profile", response_model=CharacterOut)
def upload_character_profile(cid: int, file: UploadFile = File(...),
                             user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    # 先做文件级校验（400），再判存储可用性（503）：
    # 未配置 S3 时非法文件仍应返回 400（测试依赖此顺序）
    if file.content_type not in _PROFILE_EXT:
        raise HTTPException(400, "仅支持 PNG/JPG/WebP 图片")
    data = file.file.read()
    if len(data) > _MAX_PROFILE_BYTES:
        raise HTTPException(400, "图片不能超过 10MB")
    ext = _PROFILE_EXT[file.content_type]
    # magic 字节校验：拒绝伪造 ContentType 的垃圾内容
    if detect_image(data) != ext:
        raise HTTPException(400, "图片内容与格式不符")
    if not s3.s3_configured():
        raise HTTPException(503, "图片存储未配置")
    try:
        url = s3.upload_profile(user.id, c.id, ext, data, image_content_type(ext))
    except Exception:
        raise HTTPException(503, "图片存储暂不可用")
    if c.profile:
        s3.delete_profile(c.profile)
    c.profile = url
    db.commit()
    db.refresh(c)
    return character_out(c)

@router.delete("/{cid}/profile", response_model=CharacterOut)
def restore_default_profile(cid: int, user: User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    c = _own_character(db, cid, user)
    if c.profile:
        s3.delete_profile(c.profile)
    c.profile = None
    db.commit()
    db.refresh(c)
    return character_out(c)
