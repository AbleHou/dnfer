"""「我的群友」：登录用户均可用的全局角色查询。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas import MemberCharacterQueryResult, MemberCharacterRow
from ..services.characters import character_out
from ..services.query import query_characters

router = APIRouter(prefix="/api/characters", tags=["friends"])


@router.get("/query", response_model=MemberCharacterQueryResult)
def query_friend_characters(
    job_name: str | None = None,
    class_type: str | None = None,
    keyword: str | None = None,
    owner: str | None = None,
    sort: str = "fame",
    order: str = "desc",
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    try:
        rows, total = query_characters(db, job_name=job_name, class_type=class_type,
                                       keyword=keyword, owner=owner, sort=sort,
                                       order=order, limit=limit, offset=offset)
    except ValueError as e:
        raise HTTPException(400, str(e))
    items = [
        MemberCharacterRow(**character_out(c).model_dump(),
                           owner_id=c.owner.id, owner_nickname=c.owner.nickname,
                           owner_avatar=c.owner.avatar)
        for c in rows
    ]
    return MemberCharacterQueryResult(items=items, total=total)
