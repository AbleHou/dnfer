from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import AdventureParty, Character
from ..schemas import AdventurePartyOut


def list_parties(db: Session, user) -> list[AdventureParty]:
    return (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id)
            .order_by(AdventureParty.id).all())


def ensure_default_party(db: Session, user) -> AdventureParty:
    party = (db.query(AdventureParty)
             .filter(AdventureParty.user_id == user.id)
             .order_by(AdventureParty.id).first())
    if party is None:
        party = AdventureParty(user_id=user.id, name=f"{user.nickname}的冒险团")
        db.add(party)
        db.flush()
    return party


def _own_party(db: Session, pid: int, user) -> AdventureParty:
    p = db.get(AdventureParty, pid)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "冒险团不存在")
    return p


def create_party(db: Session, user, name: str) -> AdventureParty:
    name = name.strip()
    if not name:
        raise HTTPException(400, "团名不能为空")
    if (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id,
                    AdventureParty.name == name).first()):
        raise HTTPException(400, "冒险团已存在")
    p = AdventureParty(user_id=user.id, name=name)
    db.add(p)
    return p


def rename_party(db: Session, user, pid: int, name: str) -> AdventureParty:
    p = _own_party(db, pid, user)
    name = name.strip()
    if not name:
        raise HTTPException(400, "团名不能为空")
    if (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id,
                    AdventureParty.name == name,
                    AdventureParty.id != pid).first()):
        raise HTTPException(400, "冒险团已存在")
    p.name = name
    return p


def delete_party(db: Session, user, pid: int) -> None:
    p = _own_party(db, pid, user)
    if (db.query(Character)
            .filter(Character.adventure_party_id == pid).first()):
        raise HTTPException(400, "请先转移或删除该团角色")
    if (db.query(AdventureParty)
            .filter(AdventureParty.user_id == user.id).count() <= 1):
        raise HTTPException(400, "至少保留一个冒险团")
    db.delete(p)


def resolve_party(db: Session, owner, party_id: int | None) -> AdventureParty:
    if party_id is None:
        return ensure_default_party(db, owner)
    p = db.get(AdventureParty, party_id)
    if p is None or p.user_id != owner.id:
        raise HTTPException(400, "冒险团不存在")
    return p


def party_out(p: AdventureParty, character_count: int = 0) -> AdventurePartyOut:
    return AdventurePartyOut(id=p.id, name=p.name, created_at=p.created_at,
                             character_count=character_count)


def party_out_with_count(db: Session, p: AdventureParty) -> AdventurePartyOut:
    count = (db.query(func.count(Character.id))
             .filter(Character.adventure_party_id == p.id).scalar())
    return party_out(p, count or 0)


def parties_out(db: Session, user) -> list[AdventurePartyOut]:
    parties = list_parties(db, user)
    ids = [p.id for p in parties]
    counts: dict[int, int] = {}
    if ids:
        counts = dict(db.query(Character.adventure_party_id, func.count(Character.id))
                      .filter(Character.adventure_party_id.in_(ids))
                      .group_by(Character.adventure_party_id).all())
    return [party_out(p, counts.get(p.id, 0)) for p in parties]
