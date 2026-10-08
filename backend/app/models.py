from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

def _now() -> datetime:
    # SQLite 的 DateTime 列存 naive；统一用 naive UTC 避免 aware/naive 比较报错
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    nickname: Mapped[str] = mapped_column(String(64))
    avatar: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    characters: Mapped[list["Character"]] = relationship(back_populates="owner")

class RegistrationCode(Base):
    __tablename__ = "registration_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    single_use: Mapped[bool] = mapped_column(Boolean, default=True)

class Character(Base):
    __tablename__ = "characters"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    job_name: Mapped[str] = mapped_column(String(64))  # 具体职业（职业信息.json 的 children.name）
    class_type: Mapped[str] = mapped_column(String(8))  # "输出" | "辅助"（job_name 写库时推导的冗余快照）
    fame: Mapped[int] = mapped_column(Integer, default=0)
    simulated_damage: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 输出
    sustained_dps: Mapped[int | None] = mapped_column(Integer, nullable=True)      # 输出
    buff_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)        # 辅助
    sun_buff: Mapped[int | None] = mapped_column(Integer, nullable=True)        # 辅助：太阳增益
    owner: Mapped[User] = relationship(back_populates="characters")

class Dungeon(Base):
    __tablename__ = "dungeons"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    size: Mapped[int] = mapped_column(Integer, default=12)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

class Raid(Base):
    __tablename__ = "raids"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    dungeon_id: Mapped[int] = mapped_column(ForeignKey("dungeons.id"), index=True)
    size: Mapped[int] = mapped_column(Integer, default=12)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    dungeon: Mapped[Dungeon] = relationship()
    waves: Mapped[list["Wave"]] = relationship(back_populates="raid",
                                               order_by="Wave.index", cascade="all, delete-orphan")
    signups: Mapped[list["RaidSignup"]] = relationship(
        back_populates="raid", cascade="all, delete-orphan")
    slack_rule: Mapped["RaidSlackRule | None"] = relationship(back_populates="raid",
                                                              cascade="all, delete-orphan")

class Wave(Base):
    __tablename__ = "waves"
    __table_args__ = (UniqueConstraint("raid_id", "index"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    raid: Mapped[Raid] = relationship(back_populates="waves")
    slots: Mapped[list["Slot"]] = relationship(back_populates="wave",
                                               cascade="all, delete-orphan")

class Slot(Base):
    __tablename__ = "slots"
    __table_args__ = (UniqueConstraint("wave_id", "squad_index", "row_index"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    wave_id: Mapped[int] = mapped_column(ForeignKey("waves.id"), index=True)
    squad_index: Mapped[int] = mapped_column(Integer)
    row_index: Mapped[int] = mapped_column(Integer)
    character_id: Mapped[int | None] = mapped_column(ForeignKey("characters.id"), nullable=True)
    duty: Mapped[str | None] = mapped_column(String(16), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wave: Mapped[Wave] = relationship(back_populates="slots")
    character: Mapped[Character | None] = relationship()

class RaidSignup(Base):
    __tablename__ = "raid_signups"
    __table_args__ = (UniqueConstraint("raid_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    raid: Mapped[Raid] = relationship(back_populates="signups")
    user: Mapped[User] = relationship()
    characters: Mapped[list["RaidSignupCharacter"]] = relationship(
        back_populates="signup", cascade="all, delete-orphan")

class RaidSignupCharacter(Base):
    __tablename__ = "raid_signup_characters"
    __table_args__ = (UniqueConstraint("signup_id", "character_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    signup_id: Mapped[int] = mapped_column(ForeignKey("raid_signups.id"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    signup: Mapped["RaidSignup"] = relationship(back_populates="characters")
    character: Mapped["Character"] = relationship()

class RaidSlackRule(Base):
    __tablename__ = "raid_slack_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    raid_id: Mapped[int] = mapped_column(ForeignKey("raids.id", ondelete="CASCADE"),
                                         unique=True, index=True)
    rules: Mapped[dict] = mapped_column(JSON)      # {"criteria": [...], "exchange": [...]}
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    raid: Mapped[Raid] = relationship(back_populates="slack_rule")

class Vote(Base):
    __tablename__ = "votes"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    multi_choice: Mapped[bool] = mapped_column(Boolean, default=False)
    open: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    options: Mapped[list["VoteOption"]] = relationship(back_populates="vote",
                                                       order_by="VoteOption.id",
                                                       cascade="all, delete-orphan")
    ballots: Mapped[list["VoteBallot"]] = relationship(back_populates="vote",
                                                       cascade="all, delete-orphan")

class VoteOption(Base):
    __tablename__ = "vote_options"
    id: Mapped[int] = mapped_column(primary_key=True)
    vote_id: Mapped[int] = mapped_column(ForeignKey("votes.id"), index=True)
    text: Mapped[str] = mapped_column(String(128))
    vote: Mapped[Vote] = relationship(back_populates="options")
    ballots: Mapped[list["VoteBallot"]] = relationship(back_populates="option",
                                                       cascade="all, delete-orphan")

class VoteBallot(Base):
    __tablename__ = "vote_ballots"
    __table_args__ = (UniqueConstraint("vote_id", "user_id", "option_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    vote_id: Mapped[int] = mapped_column(ForeignKey("votes.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)  # None=匿名票
    option_id: Mapped[int] = mapped_column(ForeignKey("vote_options.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    vote: Mapped[Vote] = relationship(back_populates="ballots")
    option: Mapped[VoteOption] = relationship(back_populates="ballots")
    user: Mapped[User | None] = relationship()
