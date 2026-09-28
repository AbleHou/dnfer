from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..models import Vote, VoteBallot, VoteOption
from ..schemas import VoteCreate, VoteDetail, VoteListItem, VoteOptionOut


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _vote_or_404(db: Session, vid: int) -> Vote:
    v = db.get(Vote, vid)
    if v is None:
        raise HTTPException(404, "投票不存在")
    return v


def _total_voters(db: Session, vote: Vote) -> int:
    """投票人数 = 实名去重 + 匿名票行数（匿名每行为一位「匿名」投票者）。"""
    attributed = db.query(func.count(func.distinct(VoteBallot.user_id))) \
        .filter(VoteBallot.vote_id == vote.id, VoteBallot.user_id.isnot(None)).scalar() or 0
    anonymous = db.query(func.count(VoteBallot.id)) \
        .filter(VoteBallot.vote_id == vote.id, VoteBallot.user_id.is_(None)).scalar() or 0
    return attributed + anonymous


def vote_list_item(db: Session, vote: Vote) -> VoteListItem:
    return VoteListItem(id=vote.id, title=vote.title, multi_choice=vote.multi_choice,
                        open=vote.open, created_at=vote.created_at, closed_at=vote.closed_at,
                        total_voters=_total_voters(db, vote))


def vote_detail(db: Session, vote: Vote, viewer_user_id: int | None = None) -> VoteDetail:
    """详情：各选项 count + voters（匿名票显示「匿名」）；实名查看者回填 my_option_ids/my_voted。"""
    options = db.query(VoteOption).filter(VoteOption.vote_id == vote.id) \
        .order_by(VoteOption.id).all()
    counts = dict(db.query(VoteBallot.option_id, func.count(VoteBallot.id))
                  .filter(VoteBallot.vote_id == vote.id)
                  .group_by(VoteBallot.option_id).all())
    voters: dict[int, list[str]] = defaultdict(list)
    for b in db.query(VoteBallot).options(selectinload(VoteBallot.user)) \
            .filter(VoteBallot.vote_id == vote.id).order_by(VoteBallot.id).all():
        voters[b.option_id].append(b.user.nickname if b.user is not None else "匿名")
    my_ids: list[int] = []
    if viewer_user_id is not None:
        my_ids = [oid for (oid,) in db.query(VoteBallot.option_id)
                  .filter(VoteBallot.vote_id == vote.id,
                          VoteBallot.user_id == viewer_user_id).all()]
    return VoteDetail(id=vote.id, title=vote.title, description=vote.description,
                      multi_choice=vote.multi_choice, open=vote.open,
                      created_at=vote.created_at, closed_at=vote.closed_at,
                      options=[VoteOptionOut(id=o.id, text=o.text,
                                             count=counts.get(o.id, 0),
                                             voters=voters.get(o.id, [])) for o in options],
                      total_voters=_total_voters(db, vote),
                      my_option_ids=my_ids, my_voted=bool(my_ids))


def create_vote(db: Session, admin_user_id: int, body: VoteCreate) -> Vote:
    """创建投票：存在打开的投票则拒绝（同时仅一个打开）。"""
    if db.query(Vote).filter(Vote.open.is_(True)).first():
        raise HTTPException(400, "尚有悬而未决的事情")
    vote = Vote(title=body.title, description=body.description,
                multi_choice=body.multi_choice, created_by=admin_user_id)
    db.add(vote)
    db.flush()
    for text in body.options:
        db.add(VoteOption(vote_id=vote.id, text=text))
    db.commit()
    db.refresh(vote)
    return vote


def close_vote(db: Session, vote: Vote) -> Vote:
    vote.open = False
    vote.closed_at = _now()
    db.commit()
    db.refresh(vote)
    return vote


def _validate_selection(db: Session, vote: Vote, option_ids: list[int]) -> None:
    if not vote.open:
        raise HTTPException(400, "投票已结束")
    if len(set(option_ids)) != len(option_ids):
        raise HTTPException(400, "选项重复")
    if not vote.multi_choice and len(option_ids) != 1:
        raise HTTPException(400, "单选投票只能选择一个选项")
    valid = {oid for (oid,) in db.query(VoteOption.id)
             .filter(VoteOption.vote_id == vote.id).all()}
    if not set(option_ids).issubset(valid):
        raise HTTPException(400, "选项不存在")


def cast_vote(db: Session, vote: Vote, user_id: int | None,
              option_ids: list[int], anonymous: bool) -> None:
    """投票（不可改不可撤）。实名票：已投则拒绝；匿名票：无身份、后端不追溯（前端会话态阻止重复）。"""
    _validate_selection(db, vote, option_ids)
    if user_id is not None and not anonymous:
        if db.query(VoteBallot).filter(VoteBallot.vote_id == vote.id,
                                       VoteBallot.user_id == user_id).first():
            raise HTTPException(400, "你已投票")
        for oid in option_ids:
            db.add(VoteBallot(vote_id=vote.id, user_id=user_id, option_id=oid))
    else:
        for oid in option_ids:
            db.add(VoteBallot(vote_id=vote.id, user_id=None, option_id=oid))
    db.commit()
