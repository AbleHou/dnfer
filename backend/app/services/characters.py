from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import jobs as job_data
from ..models import Character, Slot
from ..schemas import CharacterIn, CharacterOut


def character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount)


def validate_job(job_name: str) -> None:
    if job_data.job_meta(job_name) is None:
        raise HTTPException(400, "职业不存在")


def apply_character_payload(c: Character, body: CharacterIn) -> None:
    c.name = body.name
    c.job_name = body.job_name
    c.class_type = job_data.class_type_for(body.job_name)
    c.fame = body.fame
    c.simulated_damage = body.simulated_damage
    c.sustained_dps = body.sustained_dps
    c.buff_amount = body.buff_amount


def delete_character_if_free(db: Session, cid: int) -> None:
    in_use = db.query(Slot).filter(Slot.character_id == cid).first()
    if in_use:
        raise HTTPException(400, "该角色正在攻坚中，请先撤下")
