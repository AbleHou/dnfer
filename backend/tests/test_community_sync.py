from app.services.community_sync import resolve_job

def test_resolve_job_unique_title():
    assert resolve_job("极诣·剑魂") == "weapon_master"
    assert resolve_job("知源·召唤师") == "summoner"
    assert resolve_job("千魂·狩猎者") == "dragoon"
    assert resolve_job("隐夜·暗星") == "rogue"

def test_resolve_job_gender_split_defaults_male():
    assert resolve_job("重霄·漫游枪手(男)") == "ranger_male"
    assert resolve_job("重霄·漫游枪手(女)") == "ranger_male"
    assert resolve_job("光启·光明骑士(男)") == "crusader_male"
    assert resolve_job("光启·蓝拳圣使(男)") == "infighter"
    assert resolve_job("归元·气功师（女）") == "nenmaster_male"

def test_resolve_job_unknown_returns_none():
    assert resolve_job("不存在的职业") is None
    assert resolve_job("") is None
