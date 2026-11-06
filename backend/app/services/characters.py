from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import jobs as job_data
from .. import s3
from ..models import Character, RaidSignupCharacter, Slot
from ..schemas import CharacterIn, CharacterOut
from .damage import compute_combat_power


def character_out(c: Character) -> CharacterOut:
    meta = job_data.job_meta(c.job_name) or {"title": "", "parent_name": ""}
    party = c.adventure_party
    return CharacterOut(id=c.id, name=c.name, job_name=c.job_name,
                        job_title=meta["title"], parent_name=meta["parent_name"],
                        class_type=c.class_type, fame=c.fame,
                        simulated_damage=c.simulated_damage,
                        sustained_dps=c.sustained_dps, buff_amount=c.buff_amount,
                        sun_buff=c.sun_buff,
                        atk_base=c.atk_base, str_int=c.str_int, elemental=c.elemental,
                        atk_power=c.atk_power, atk_power_amp=c.atk_power_amp,
                        skill_atk=c.skill_atk, combat_power=c.combat_power,
                        profile=c.profile,
                        adventure_party_id=c.adventure_party_id,
                        adventure_party_name=party.name if party else None)


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
    c.sun_buff = body.sun_buff
    if c.class_type == "输出":
        c.atk_base = body.atk_base
        c.str_int = body.str_int
        c.elemental = body.elemental
        c.atk_power = body.atk_power
        c.atk_power_amp = body.atk_power_amp
        c.skill_atk = body.skill_atk
        c.combat_power = compute_combat_power(body.atk_base, body.str_int, body.elemental,
                                              body.atk_power, body.atk_power_amp, body.skill_atk)
    else:
        c.atk_base = None
        c.str_int = None
        c.elemental = None
        c.atk_power = None
        c.atk_power_amp = None
        c.skill_atk = None
        c.combat_power = None


def delete_character_if_free(db: Session, cid: int) -> None:
    in_use = db.query(Slot).filter(Slot.character_id == cid).first()
    if in_use:
        raise HTTPException(400, "该角色正在攻坚中，请先撤下")
    c = db.get(Character, cid)
    if c and c.profile:
        s3.delete_profile(c.profile)
    # 角色在报名勾选中 → 一并移除子行；若该报名因此清空 → 整条取消报名
    for rsc in db.query(RaidSignupCharacter).filter(
            RaidSignupCharacter.character_id == cid).all():
        signup = rsc.signup
        db.delete(rsc)
        remaining = db.query(RaidSignupCharacter).filter(
            RaidSignupCharacter.signup_id == signup.id,
            RaidSignupCharacter.character_id != cid).count()
        if remaining == 0:
            db.delete(signup)  # 角色已 free（无占位），无需撤占位；此路径不广播
