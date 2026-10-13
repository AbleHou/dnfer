from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas import AdventurePartyIn, AdventurePartyOut
from ..services.parties import (create_party, delete_party, parties_out,
                                party_out, rename_party)

router = APIRouter(prefix="/api/me/adventure-parties", tags=["members"])


@router.get("", response_model=list[AdventurePartyOut])
def list_my_parties(user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    return parties_out(db, user)


@router.post("", response_model=AdventurePartyOut)
def create_my_party(body: AdventurePartyIn,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    p = create_party(db, user, body.name)
    db.commit()
    db.refresh(p)
    return party_out(p)


@router.put("/{pid}", response_model=AdventurePartyOut)
def rename_my_party(pid: int, body: AdventurePartyIn,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    p = rename_party(db, user, pid, body.name)
    db.commit()
    db.refresh(p)
    return party_out(p)


@router.delete("/{pid}")
def delete_my_party(pid: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    delete_party(db, user, pid)
    db.commit()
    return {"ok": True}
