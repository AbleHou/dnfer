from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

class CharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    job_name: str = Field(min_length=1, max_length=64)
    fame: int = Field(default=0, ge=0)
    simulated_damage: int | None = None
    sustained_dps: int | None = None
    buff_amount: int | None = None

class CharacterOut(BaseModel):
    id: int
    name: str
    job_name: str
    job_title: str
    parent_name: str
    class_type: str
    fame: int
    simulated_damage: int | None
    sustained_dps: int | None
    buff_amount: int | None

class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=1, max_length=64)
    code: str

class LoginIn(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    nickname: str
    is_admin: bool

class PlayerCharacters(BaseModel):
    user: UserOut
    characters: list[CharacterOut]

class CodeCreate(BaseModel):
    single_use: bool = True
    expire_days: int | None = None

class CodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    used_by: int | None
    used_at: datetime | None
    expires_at: datetime | None
    single_use: bool

class DungeonIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    size: int = 12
    description: str = Field(default="", max_length=2000)

class DungeonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    size: int
    description: str
    created_at: datetime

class RaidCreate(BaseModel):
    name: str | None = None
    dungeon_id: int
    starts_at: datetime

class RaidUpdate(BaseModel):
    name: str | None = None
    starts_at: datetime | None = None

class RaidListItem(BaseModel):
    id: int
    name: str
    dungeon_id: int
    dungeon_name: str
    size: int
    locked: bool
    starts_at: datetime
    wave_count: int

class SlotOut(BaseModel):
    id: int
    squad_index: int
    row_index: int
    character_id: int | None
    character_name: str | None
    character_class: str | None
    job_name: str | None
    job_title: str | None
    fame: int | None
    simulated_damage: int | None
    sustained_dps: int | None
    buff_amount: int | None
    owner_id: int | None
    owner_nickname: str | None
    duty: str | None
    version: int

class WaveOut(BaseModel):
    id: int
    index: int
    slots: list[SlotOut]

class RaidDetail(BaseModel):
    id: int
    name: str
    dungeon_id: int
    dungeon_name: str
    size: int
    locked: bool
    starts_at: datetime
    waves: list[WaveOut]

class FillIn(BaseModel):
    character_id: int
    duty: str | None = None  # 可选；缺省按职业默认（主C/主奶）
    replace: bool = False    # True：遇到角色已在其他格 / 同玩家同波已占位时，自动撤下冲突格子再放入

class DutyIn(BaseModel):
    duty: str

class MoveIn(BaseModel):
    target_slot_id: int

class SlotMutationResult(BaseModel):
    slot: SlotOut
    warnings: list[str] = []

class FillResponse(BaseModel):
    slot: SlotOut
    warnings: list[str] = []
    removed_slots: list[SlotOut] = []

class JobChild(BaseModel):
    id: int
    name: str
    title: str
    class_type: Literal["输出", "辅助"]

class JobCategory(BaseModel):
    id: int
    name: str
    title: str
    children: list[JobChild]

class BotCharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    job_name: str | None = Field(default=None, min_length=1, max_length=64)
    fame: int | None = Field(default=None, ge=0)
    simulated_damage: int | None = None
    sustained_dps: int | None = None
    buff_amount: int | None = None

class BotCharactersIn(BaseModel):
    account: str = Field(min_length=1, max_length=64)
    characters: list[BotCharacterIn]

class BotCharacterResult(BaseModel):
    name: str
    ok: bool
    action: Literal["created", "updated"] | None = None
    error: str | None = None
    character: CharacterOut | None = None

class BotCharactersOut(BaseModel):
    account: str
    results: list[BotCharacterResult]

class BotCharacterList(BaseModel):
    account: str
    nickname: str
    characters: list[CharacterOut]
