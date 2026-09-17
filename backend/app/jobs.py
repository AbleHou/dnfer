import json
from functools import lru_cache
from pathlib import Path

from .config import settings

SUPPORT_JOBS = frozenset({"crusader_male", "crusader_female", "paramedic",
                          "enchantress", "muse"})

@lru_cache(maxsize=1)
def _load() -> list[dict]:
    path = Path(settings.job_data_path)
    if not path.exists():
        raise FileNotFoundError(f"职业数据文件不存在: {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def class_type_for(job_name: str) -> str:
    return "辅助" if job_name in SUPPORT_JOBS else "输出"

def job_meta(job_name: str) -> dict | None:
    for cat in _load():
        for c in cat.get("children", []):
            if c.get("name") == job_name:
                return {"title": c.get("title", ""), "parent_name": cat.get("name", "")}
    return None

def job_tree() -> list[dict]:
    out = []
    for cat in _load():
        children = [c for c in cat.get("children", []) if c.get("name") != "empty"]
        if not children:
            continue
        out.append({
            "id": cat["id"], "name": cat["name"], "title": cat.get("title", ""),
            "children": [
                {"id": c.get("id"), "name": c["name"], "title": c.get("title", ""),
                 "class_type": class_type_for(c["name"])}
                for c in children
            ],
        })
    return out
