DUTY_BY_CLASS = {
    "输出": ["主C", "辅C", "划水"],
    "辅助": ["主奶", "太阳奶", "划水"],
}
VALID_DUTIES = {"主C", "辅C", "主奶", "太阳奶", "划水"}

def duty_options(class_type: str) -> list[str]:
    return list(DUTY_BY_CLASS[class_type])

def default_duty(class_type: str) -> str:
    return "主C" if class_type == "输出" else "主奶"

def duty_valid_for_class(duty: str, class_type: str) -> bool:
    return duty in DUTY_BY_CLASS[class_type]

def check_composition(occupied, is_full: bool) -> list[str]:
    """occupied: list[(duty, class_type)] 仅已占位成员。
    返回问题列表；is_full=True 时这些问题视为硬错误，否则为警告。
    小队内任一划水成员则免除组成要求。"""
    issues: list[str] = []
    main_healers = [d for d, _ in occupied if d == "主奶"]
    if len(main_healers) > 1:
        issues.append("至多一名主奶")
    if any(d == "划水" for d, _ in occupied):
        return issues  # 有划水，免除组成要求
    has_dps = any(ct == "输出" for _, ct in occupied)
    has_supp = any(ct == "辅助" for _, ct in occupied)
    has_mainc = any(d == "主C" for d, _ in occupied)
    if not has_dps:
        issues.append("缺少输出")
    if not has_supp:
        issues.append("缺少辅助")
    if not has_mainc:
        issues.append("缺少主C")
    return issues
