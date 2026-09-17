from .helpers import register_user

def test_class_type_for_support_jobs():
    from app.jobs import class_type_for
    for j in ["crusader_male", "crusader_female", "paramedic", "enchantress", "muse"]:
        assert class_type_for(j) == "辅助"

def test_class_type_for_output_jobs():
    from app.jobs import class_type_for
    for j in ["weapon_master", "berserker", "elementalist"]:
        assert class_type_for(j) == "输出"

def test_jobs_endpoint_requires_login(client):
    assert client.get("/api/jobs").status_code == 401

def test_jobs_endpoint_tree(client):
    h, _ = register_user(client, "p1", "甲")
    r = client.get("/api/jobs", headers=h)
    assert r.status_code == 200
    tree = r.json()
    assert len(tree) > 0
    by_name = {c["name"]: c for cat in tree for c in cat["children"]}
    assert "empty" not in by_name
    assert by_name["enchantress"]["class_type"] == "辅助"
    assert by_name["enchantress"]["title"] == "知源·小魔女"
    assert by_name["weapon_master"]["class_type"] == "输出"
