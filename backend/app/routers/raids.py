from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import jobs as job_data
from ..auth import get_current_user, require_admin
from ..db import get_db
from ..models import Character, Dungeon, Raid, RaidSignup, Slot, User, Wave
from ..schemas import (DutyIn, FillIn, FillResponse, MoveIn, RaidCreate,
                       RaidDetail, RaidListItem, RaidSignupOut, RaidUpdate,
                       SignupUserIn, SlotMutationResult, SlotOut, UserOut,
                       WaveOut)
from ..services.raid_builder import create_raid as _build_raid, create_wave
from ..services.raid_validator import (check_composition, default_duty,
                                       duty_valid_for_class)
from ..ws import manager

def _now() -> datetime:
    # 与 models._now 一致：SQLite DateTime 存 naive，统一 naive UTC
    return datetime.now(timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/api/raids", tags=["raids"])

def _raid_or_404(db: Session, rid: int) -> Raid:
    r = db.get(Raid, rid)
    if r is None:
        raise HTTPException(404, "攻坚不存在")
    return r

def _clear_slot(slot: Slot) -> None:
    slot.character_id = None
    slot.duty = None
    slot.version += 1
    slot.updated_by = None
    slot.updated_at = None

def _slot_out(slot: Slot) -> SlotOut:
    c = slot.character
    meta = job_data.job_meta(c.job_name) if c else None
    return SlotOut(
        id=slot.id, squad_index=slot.squad_index, row_index=slot.row_index,
        character_id=slot.character_id,
        character_name=c.name if c else None,
        character_class=c.class_type if c else None,
        job_name=c.job_name if c else None,
        job_title=(meta or {}).get("title") if c else None,
        fame=c.fame if c else None,
        simulated_damage=c.simulated_damage if c else None,
        sustained_dps=c.sustained_dps if c else None,
        buff_amount=c.buff_amount if c else None,
        owner_id=c.owner.id if c else None,
        owner_nickname=c.owner.nickname if c else None,
        owner_avatar=c.owner.avatar if c else None,
        duty=slot.duty, version=slot.version,
    )

def _participates(db: Session, raid: Raid, user_id: int) -> bool:
    """用户是否参与本场攻坚：团长恒参与，其余须有报名行。"""
    if user_id == raid.created_by:
        return True
    return db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                       RaidSignup.user_id == user_id).first() is not None

def _detail(db: Session, raid: Raid) -> RaidDetail:
    waves = []
    for w in raid.waves:
        waves.append(WaveOut(id=w.id, index=w.index,
                             slots=[_slot_out(s) for s in w.slots]))
    signups = [RaidSignupOut(user=UserOut.model_validate(db.get(User, raid.created_by)),
                             created_at=None)]
    for rs in db.query(RaidSignup).options(selectinload(RaidSignup.user)) \
            .filter(RaidSignup.raid_id == raid.id,
                    RaidSignup.user_id != raid.created_by) \
            .order_by(RaidSignup.created_at).all():
        signups.append(RaidSignupOut(user=UserOut.model_validate(rs.user),
                                     created_at=rs.created_at))
    return RaidDetail(id=raid.id, name=raid.name, dungeon_id=raid.dungeon_id,
                      dungeon_name=raid.dungeon.name, size=raid.size,
                      locked=raid.locked, starts_at=raid.starts_at, waves=waves,
                      signups=signups)

def _squad_occupied(db: Session, wave: Wave, squad_index: int) -> list[tuple[str, str]]:
    return [(s.duty, s.character.class_type) for s in wave.slots
            if s.squad_index == squad_index and s.character_id is not None]

def _validate_squad(db: Session, wave: Wave, squad_index: int) -> tuple[list[str], list[str]]:
    """返回 (hard_errors, warnings)。
    hard_errors：主奶超限（恒为硬性）+ 满员(4/4)且无划水时的组成问题 → 400。
    warnings：未满员时的组成问题 → 仅提示。"""
    occupied = _squad_occupied(db, wave, squad_index)
    filled = len(occupied)
    issues = check_composition(occupied, is_full=False)
    hard = [i for i in issues if i.startswith("至多")]  # 主奶不变量
    comp = [i for i in issues if not i.startswith("至多")]
    if filled == 4 and not any(d == "划水" for d, _ in occupied):
        hard = hard + comp
        warnings: list[str] = []
    else:
        warnings = comp
    return hard, warnings

def _raise_if_hard(db: Session, wave: Wave, squad_index: int) -> list[str]:
    """校验当前小队状态，存在硬错误则 400，否则返回警告。"""
    hard, warnings = _validate_squad(db, wave, squad_index)
    if hard:
        raise HTTPException(400, "；".join(hard))
    return warnings

@router.get("", response_model=list[RaidListItem])
def list_raids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = dict(db.query(RaidSignup.raid_id,
                           func.count(RaidSignup.id)).group_by(RaidSignup.raid_id).all())
    my_ids = {rs.raid_id for rs in db.query(RaidSignup)
              .filter(RaidSignup.user_id == user.id).all()}
    items = []
    for r in db.query(Raid).options(selectinload(Raid.dungeon)).order_by(Raid.created_at.desc()).all():
        items.append(RaidListItem(id=r.id, name=r.name, dungeon_id=r.dungeon_id,
                                  dungeon_name=r.dungeon.name, size=r.size,
                                  locked=r.locked, starts_at=r.starts_at,
                                  wave_count=len(r.waves),
                                  signup_count=counts.get(r.id, 0),
                                  my_signed_up=(r.created_by == user.id) or r.id in my_ids))
    return items

@router.post("")
def create_raid(body: RaidCreate, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    dungeon = db.get(Dungeon, body.dungeon_id)
    if dungeon is None:
        raise HTTPException(404, "副本不存在")
    name = body.name or dungeon.name
    raid = _build_raid(db, name, dungeon, body.starts_at, admin.id)
    db.commit()
    return _detail(db, raid)

@router.get("/{rid}", response_model=RaidDetail)
def get_raid(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, _raid_or_404(db, rid))

@router.put("/{rid}")
def update_raid(rid: int, body: RaidUpdate, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if body.name is not None:
        raid.name = body.name
    if body.starts_at is not None:
        raid.starts_at = body.starts_at
    db.commit()
    return _detail(db, raid)

@router.delete("/{rid}")
def delete_raid(rid: int, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    db.delete(raid)  # waves/slots 经级联一并清理
    db.commit()
    return {"ok": True}

@router.post("/{rid}/lock")
async def lock_raid(rid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    raid.locked = True
    db.commit()
    await manager.broadcast(rid, {"type": "raid:locked"})
    return {"ok": True}

@router.post("/{rid}/unlock")
async def unlock_raid(rid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    raid.locked = False
    db.commit()
    await manager.broadcast(rid, {"type": "raid:unlocked"})
    return {"ok": True}

def _can_edit(user: User, raid: Raid) -> bool:
    return user.is_admin or not raid.locked

@router.post("/{rid}/waves")
async def add_wave(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if not _can_edit(user, raid):
        raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
    wave = create_wave(db, raid)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:added", "index": wave.index})
    return _detail(db, raid)

@router.delete("/{rid}/waves/{index}")
async def delete_wave(rid: int, index: int, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    wave = db.query(Wave).filter(Wave.raid_id == rid, Wave.index == index).first()
    if wave is None:
        raise HTTPException(404, "波次不存在")
    if len(raid.waves) <= 1:
        raise HTTPException(400, "至少保留一个波次")
    if not user.is_admin:
        if raid.locked:
            raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
        filled = [s for s in wave.slots if s.character_id is not None]
        if any(s.character.user_id != user.id for s in filled):
            raise HTTPException(403, "该波次包含他人角色，无权删除")
    db.delete(wave)
    db.commit()
    await manager.broadcast(rid, {"type": "wave:removed", "index": index})
    return {"ok": True}

@router.post("/{rid}/slots/{slot_id}/fill", response_model=FillResponse)
async def fill_slot(rid: int, slot_id: int, body: FillIn,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if not _can_edit(user, raid):
        raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
    slot = db.get(Slot, slot_id)
    if slot is None or slot.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot.character_id is not None and not user.is_admin:
        raise HTTPException(400, "该格已有人占位")
    char = db.get(Character, body.character_id)
    if char is None:
        raise HTTPException(404, "角色不存在")
    if not user.is_admin and char.user_id != user.id:
        raise HTTPException(400, "只能使用自己的角色")
    if not _participates(db, raid, char.user_id):
        if user.is_admin:
            raise HTTPException(403, "该用户未报名，无法排表")
        raise HTTPException(403, "请先报名再占位")
    removed: list[Slot] = []
    if body.replace:
        # 冲突即替换：同一角色已在其他格（任意波）或同玩家同波已有角色时，
        # 自动撤下冲突格子再放入新角色（不报错）
        char_dup = db.query(Slot).filter(Slot.character_id == char.id,
                                         Slot.id != slot.id).all()
        same_owner = db.query(Slot).filter(
            Slot.wave_id == slot.wave_id,
            Slot.id != slot.id,
            Slot.character.has(user_id=char.user_id),
        ).all()
        seen: set[int] = set()
        for s in [*char_dup, *same_owner]:
            if s.id not in seen:
                seen.add(s.id)
                removed.append(s)
    else:
        dup = db.query(Slot).filter(Slot.character_id == char.id,
                                    Slot.id != slot.id).first()
        if dup:
            raise HTTPException(400, "该角色已在其他格子中")
        # 同一波次内，一个玩家只能上一个角色（不同波次可以再上）
        same_owner = db.query(Slot).filter(
            Slot.wave_id == slot.wave_id,
            Slot.id != slot.id,
            Slot.character.has(user_id=char.user_id),
        ).first()
        if same_owner:
            raise HTTPException(400, "同一波次中一个玩家只能上一个角色")
    duty = body.duty or default_duty(char.class_type)
    if not duty_valid_for_class(duty, char.class_type):
        raise HTTPException(400, "职责与职业不匹配")
    slot.character = char   # 显式赋值 relationship，保证 identity map 一致（autoflush=False 下校验读的是内存态）
    slot.character_id = char.id
    slot.duty = duty
    for c in removed:
        _clear_slot(c)
    # 先在校验器上校验（读取的是 session 内存态，未 commit 也生效）；违规则回滚并 400
    try:
        warnings = _raise_if_hard(db, slot.wave, slot.squad_index)
    except HTTPException:
        db.rollback()
        raise
    slot.version += 1
    slot.updated_by = user.id
    slot.updated_at = _now()
    db.commit()
    db.refresh(slot)
    await manager.broadcast(rid, {"type": "slot:filled", "slot": _slot_out(slot).model_dump()})
    for c in removed:
        await manager.broadcast(rid, {"type": "slot:removed", "slot_id": c.id})
    return FillResponse(slot=_slot_out(slot), warnings=warnings,
                        removed_slots=[_slot_out(c) for c in removed])

@router.delete("/{rid}/slots/{slot_id}", response_model=SlotMutationResult)
async def remove_slot(rid: int, slot_id: int, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    slot = db.get(Slot, slot_id)
    if slot is None or slot.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot.character_id is None:
        raise HTTPException(400, "该格为空")
    if not user.is_admin:
        if raid.locked:
            raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
        if slot.character.user_id != user.id:
            raise HTTPException(403, "只能操作自己的格子")
    _clear_slot(slot)
    db.commit()
    db.refresh(slot)
    await manager.broadcast(rid, {"type": "slot:removed", "slot_id": slot_id})
    return SlotMutationResult(slot=_slot_out(slot), warnings=[])

@router.put("/{rid}/slots/{slot_id}/duty", response_model=SlotMutationResult)
async def change_duty(rid: int, slot_id: int, body: DutyIn,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    slot = db.get(Slot, slot_id)
    if slot is None or slot.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot.character_id is None:
        raise HTTPException(400, "该格为空")
    if not user.is_admin:
        if raid.locked:
            raise HTTPException(403, "攻坚已锁定，仅管理员可编辑")
        if slot.character.user_id != user.id:
            raise HTTPException(403, "只能操作自己的格子")
    char = db.get(Character, slot.character_id)
    if not duty_valid_for_class(body.duty, char.class_type):
        raise HTTPException(400, "职责与职业不匹配")
    slot.duty = body.duty
    # 先校验再 commit：主奶超限 / 满员组成规则 → 400 并回滚
    try:
        warnings = _raise_if_hard(db, slot.wave, slot.squad_index)
    except HTTPException:
        db.rollback()
        raise
    slot.version += 1
    slot.updated_at = _now()
    db.commit()
    db.refresh(slot)
    await manager.broadcast(rid, {"type": "slot:duty_changed",
                                  "slot": _slot_out(slot).model_dump()})
    return SlotMutationResult(slot=_slot_out(slot), warnings=warnings)

def _validate_one_char_per_wave(db: Session, wave_ids: set[int]) -> None:
    """跨波 move/swap 后：受影响波内同一玩家不得出现两个角色（双向校验）。"""
    for wid in wave_ids:
        seen: set[int] = set()
        for s in db.query(Slot).filter(Slot.wave_id == wid):
            if s.character_id is not None and s.character is not None:
                uid = s.character.user_id
                if uid in seen:
                    raise HTTPException(400, "同一波次中一个玩家只能上一个角色")
                seen.add(uid)


@router.post("/{rid}/slots/{slot_id}/move", response_model=FillResponse)
async def move_slot(rid: int, slot_id: int, body: MoveIn,
                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    source = db.get(Slot, slot_id)
    if source is None or source.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if slot_id == body.target_slot_id:
        raise HTTPException(400, "目标格不能是自身")
    target = db.get(Slot, body.target_slot_id)
    if target is None or target.wave.raid_id != rid:
        raise HTTPException(404, "格子不存在")
    if source.character_id is None:
        raise HTTPException(400, "该格为空")
    # 先在内存态完成 move/swap（autoflush=False，后续校验读的是内存态）
    removed: list[Slot] = []
    if target.character_id is None:
        target.character = source.character
        target.character_id = source.character_id
        target.duty = source.duty
        _clear_slot(source)
        removed.append(source)
    else:
        src_char, src_duty = source.character, source.duty
        tgt_char, tgt_duty = target.character, target.duty
        source.character = tgt_char
        source.character_id = tgt_char.id
        source.duty = tgt_duty
        target.character = src_char
        target.character_id = src_char.id
        target.duty = src_duty
    # 校验：受影响小队组成规则（空小队跳过）+ 同波同玩家
    squads = {(source.wave_id, source.squad_index), (target.wave_id, target.squad_index)}
    warnings: list[str] = []
    try:
        for wid, sq in squads:
            wave = db.get(Wave, wid)
            if _squad_occupied(db, wave, sq):
                warnings += _raise_if_hard(db, wave, sq)
        _validate_one_char_per_wave(db, {source.wave_id, target.wave_id})
    except HTTPException:
        db.rollback()
        raise
    # 版本与审计
    for s in (source, target):
        if s.character_id is not None:
            s.version += 1
            s.updated_by = admin.id
            s.updated_at = _now()
    db.commit()
    db.refresh(source)
    db.refresh(target)
    await manager.broadcast(rid, {"type": "slot:filled", "slot": _slot_out(target).model_dump()})
    if removed:
        await manager.broadcast(rid, {"type": "slot:removed", "slot_id": source.id})
    else:
        await manager.broadcast(rid, {"type": "slot:filled", "slot": _slot_out(source).model_dump()})
    return FillResponse(slot=_slot_out(target), warnings=warnings,
                        removed_slots=[_slot_out(s) for s in removed])

@router.post("/{rid}/signup")
async def signup(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if user.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first():
        raise HTTPException(400, "你已报名")
    rs = RaidSignup(raid_id=rid, user_id=user.id)
    db.add(rs)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底：唯一约束命中 → 视为已报名
        db.rollback()
        raise HTTPException(400, "你已报名")
    db.refresh(rs)
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(user).model_dump(),
                                  "created_at": rs.created_at.isoformat()})
    return {"ok": True}


async def _remove_signup(db: Session, raid: Raid, user_id: int) -> dict:
    """删除报名行 + 撤下该用户全部占位，并广播。"""
    db.query(RaidSignup).filter(RaidSignup.raid_id == raid.id,
                                RaidSignup.user_id == user_id).delete()
    removed = db.query(Slot) \
        .filter(Slot.wave.has(raid_id=raid.id),
                Slot.character.has(user_id=user_id)).all()
    for s in removed:
        _clear_slot(s)
    db.commit()
    for s in removed:
        await manager.broadcast(raid.id, {"type": "slot:removed", "slot_id": s.id})
    await manager.broadcast(raid.id, {"type": "raid:signup_removed", "user_id": user_id})
    return {"ok": True}


@router.delete("/{rid}/signup")
async def cancel_self(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if raid.locked:
        raise HTTPException(403, "攻坚已锁定，无法取消报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user.id).first() is None:
        raise HTTPException(400, "你尚未报名")
    return await _remove_signup(db, raid, user.id)


@router.delete("/{rid}/signups/{user_id}")
async def cancel_other(rid: int, user_id: int, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == user_id).first() is None:
        raise HTTPException(400, "该用户尚未报名")
    return await _remove_signup(db, raid, user_id)


@router.post("/{rid}/signups")
async def admin_signup(rid: int, body: SignupUserIn, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    raid = _raid_or_404(db, rid)
    if raid.locked:
        raise HTTPException(400, "攻坚已锁定，无法报名")
    target = db.get(User, body.user_id)
    if target is None:
        raise HTTPException(404, "用户不存在")
    if target.id == raid.created_by:
        raise HTTPException(400, "团长无需报名")
    if db.query(RaidSignup).filter(RaidSignup.raid_id == rid,
                                   RaidSignup.user_id == target.id).first():
        raise HTTPException(400, "该用户已报名")
    rs = RaidSignup(raid_id=rid, user_id=target.id)
    db.add(rs)
    try:
        db.commit()
    except IntegrityError:  # 并发重复报名兜底
        db.rollback()
        raise HTTPException(400, "该用户已报名")
    db.refresh(rs)
    # 广播的是「目标用户」而非管理员
    await manager.broadcast(rid, {"type": "raid:signup",
                                  "user": UserOut.model_validate(target).model_dump(),
                                  "created_at": rs.created_at.isoformat()})
    return {"ok": True}
