from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

class CharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    job_name: str = Field(min_length=1, max_length=64)
    fame: int = Field(default=0, ge=0)
    simulated_damage: int | None = None
    sustained_dps: int | None = None
    buff_amount: int | None = None
    sun_buff: int | None = None

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
    sun_buff: int | None

class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=1, max_length=64,
                          pattern="^[\u4e00-\u9fa5A-Za-z0-9]+$")
    code: str

class LoginIn(BaseModel):
    username: str
    password: str

class ProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=64,
                          pattern="^[\u4e00-\u9fa5A-Za-z0-9]+$")

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    nickname: str
    avatar: str | None = None
    is_admin: bool
    is_banned: bool = False

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

class SignupCharacterOut(BaseModel):
    id: int
    name: str
    job_title: str
    class_type: str

class RaidSignupOut(BaseModel):
    user: UserOut
    created_at: datetime | None  # 团长固定行（无真实报名记录）为 None
    characters: list[SignupCharacterOut] = []  # 团长固定行为空列表

class SignupUserIn(BaseModel):
    user_id: int

class SignupIn(BaseModel):
    character_ids: list[int] | None = None  # None=默认全部角色

class RaidListItem(BaseModel):
    id: int
    name: str
    dungeon_id: int
    dungeon_name: str
    size: int
    locked: bool
    starts_at: datetime
    wave_count: int
    signup_count: int = 0
    my_signed_up: bool = False

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
    owner_avatar: str | None
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
    signups: list[RaidSignupOut] = []

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
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)
    characters: list[BotCharacterIn]

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self

class BotCharacterResult(BaseModel):
    name: str
    ok: bool
    action: Literal["created", "updated"] | None = None
    error: str | None = None
    character: CharacterOut | None = None

class BotCharactersOut(BaseModel):
    account: str
    nickname: str
    results: list[BotCharacterResult]

class BotCharacterList(BaseModel):
    account: str
    nickname: str
    characters: list[CharacterOut]

class BotRegisterIn(BaseModel):
    identifier: str = Field(min_length=1)

class BotSignupIn(BaseModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)
    character_ids: list[int] | None = None  # None=默认全部角色

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self

class AdminUserOut(UserOut):
    character_count: int

class AdminCharacterRow(CharacterOut):
    owner_id: int
    owner_nickname: str
    owner_username: str
    owner_is_banned: bool

class CharacterQueryResult(BaseModel):
    items: list[AdminCharacterRow]
    total: int

class VoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    multi_choice: bool = False
    options: list[Annotated[str, Field(min_length=1, max_length=128)]] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def _distinct_options(self):
        stripped = [o.strip() for o in self.options]
        if any(not o for o in stripped):
            raise ValueError("选项不能为空")
        if len(set(stripped)) < 2:
            raise ValueError("至少需要两个不同选项")
        self.options = stripped
        return self

class VoteOptionOut(BaseModel):
    id: int
    text: str
    count: int
    voters: list[str]

class VoteListItem(BaseModel):
    id: int
    title: str
    multi_choice: bool
    open: bool
    created_at: datetime
    closed_at: datetime | None
    total_voters: int

class VoteDetail(BaseModel):
    id: int
    title: str
    description: str
    multi_choice: bool
    open: bool
    created_at: datetime
    closed_at: datetime | None
    options: list[VoteOptionOut]
    total_voters: int
    my_option_ids: list[int] = []
    my_voted: bool = False

class VoteBallotIn(BaseModel):
    option_ids: list[int] = Field(min_length=1)
    anonymous: bool = False

class PublicVoteBallotIn(BaseModel):
    """机器人代投：群聊公开，必为实名投票（不支持匿名）。"""
    option_ids: list[int] = Field(min_length=1)
    account: str | None = Field(default=None, min_length=1, max_length=64)
    nickname: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _exactly_one_identity(self):
        if (self.account is None) == (self.nickname is None):
            raise ValueError("account 与 nickname 必须恰好提供一个")
        return self
