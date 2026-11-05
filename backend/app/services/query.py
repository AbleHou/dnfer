"""角色富查询共享逻辑：管理端（/api/admin/characters/query）与「我的群友」（/api/characters/query）复用。"""

from sqlalchemy import or_
from sqlalchemy.orm import Session, contains_eager

from ..models import Character, User

SORT_COLS = {
    "fame": Character.fame,
    "combat_power": Character.combat_power,
    "simulated_damage": Character.simulated_damage,
    "sustained_dps": Character.sustained_dps,
    "buff_amount": Character.buff_amount,
    "sun_buff": Character.sun_buff,
    "name": Character.name,
}


def query_characters(db: Session, *, job_name: str | None = None,
                     class_type: str | None = None, keyword: str | None = None,
                     owner: str | None = None, sort: str = "fame",
                     order: str = "desc", limit: int = 100, offset: int = 0):
    """按筛选/排序/分页查询全量角色，返回 (rows, total)。

    非法 sort/order/class_type 抛 ValueError（调用方转 400）。
    """
    sort = sort or "fame"
    order = order or "desc"
    if sort not in SORT_COLS or order not in ("asc", "desc"):
        raise ValueError("排序参数无效")
    if class_type and class_type not in ("输出", "辅助"):
        raise ValueError("职业类别无效")
    q = db.query(Character).join(Character.owner).options(contains_eager(Character.owner))
    if job_name:
        q = q.filter(Character.job_name == job_name)
    if class_type:
        q = q.filter(Character.class_type == class_type)
    if keyword:
        q = q.filter(Character.name.contains(keyword))
    if owner:
        q = q.filter(or_(User.nickname.contains(owner), User.username.contains(owner)))
    total = q.count()
    col = SORT_COLS[sort]
    expr = col.asc() if order == "asc" else col.desc()
    if col is not Character.name:
        expr = expr.nulls_last()
    rows = q.order_by(expr, Character.id.asc()).offset(offset).limit(limit).all()
    return rows, total
