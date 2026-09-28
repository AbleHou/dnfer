from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import User, Vote
from ..schemas import VoteBallotIn, VoteDetail, VoteListItem
from ..services.votes import _vote_or_404, cast_vote, vote_detail, vote_list_item

router = APIRouter(prefix="/api/votes", tags=["votes"])


@router.get("", response_model=list[VoteListItem])
def list_votes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [vote_list_item(db, v) for v in db.query(Vote).order_by(Vote.id.desc()).all()]


@router.get("/{vid}", response_model=VoteDetail)
def get_vote(vid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return vote_detail(db, _vote_or_404(db, vid), viewer_user_id=user.id)


@router.post("/{vid}/ballots", response_model=VoteDetail)
def cast_ballot(vid: int, body: VoteBallotIn,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.is_banned:
        raise HTTPException(403, "你已被封禁，无法投票")
    vote = _vote_or_404(db, vid)
    cast_vote(db, vote, user.id, body.option_ids, body.anonymous)
    return vote_detail(db, vote, viewer_user_id=user.id)
