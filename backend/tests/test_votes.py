from .helpers import register_user


def _create_vote(client, ah, title="要不要开荒", options=None, multi=False, desc=""):
    return client.post("/api/admin/votes", headers=ah,
                       json={"title": title, "description": desc, "multi_choice": multi,
                             "options": options or ["打", "不打"]})


def test_create_vote_admin_only(client, admin_headers, db):
    h, u = register_user(client, "u1", "玩家一")
    assert _create_vote(client, h).status_code == 403  # 非管理员
    r = _create_vote(client, admin_headers)
    assert r.status_code == 200
    assert r.json()["open"] is True
    assert [o["text"] for o in r.json()["options"]] == ["打", "不打"]


def test_create_vote_rejects_when_open_exists(client, admin_headers, db):
    assert _create_vote(client, admin_headers).status_code == 200
    r = _create_vote(client, admin_headers, title="第二个")
    assert r.status_code == 400
    assert r.json()["detail"] == "尚有悬而未决的事情"


def test_create_vote_options_validation(client, admin_headers, db):
    assert _create_vote(client, admin_headers, options=["只有一项"]).status_code == 422
    assert _create_vote(client, admin_headers, options=["重复", "重复"]).status_code == 422
    assert _create_vote(client, admin_headers, options=["", "空白"]).status_code == 422


def test_vote_single_and_counts(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, u = register_user(client, "u2", "投票甲")
    r = client.post(f"/api/votes/{vid}/ballots", headers=h, json={"option_ids": [1]})
    assert r.status_code == 200
    opt1 = next(o for o in r.json()["options"] if o["id"] == 1)
    assert opt1["count"] == 1 and opt1["voters"] == ["投票甲"]
    assert r.json()["my_option_ids"] == [1] and r.json()["my_voted"] is True
    # 单选投两个 → 400
    assert client.post(f"/api/votes/{vid}/ballots", headers=h,
                       json={"option_ids": [1, 2]}).status_code == 400


def test_multi_choice_allows_multiple(client, admin_headers, db):
    vid = _create_vote(client, admin_headers, multi=True).json()["id"]
    h, _ = register_user(client, "u3", "投票乙")
    r = client.post(f"/api/votes/{vid}/ballots", headers=h,
                    json={"option_ids": [1, 2]})
    assert r.status_code == 200
    assert [o["count"] for o in r.json()["options"]] == [1, 1]
    assert sorted(r.json()["my_option_ids"]) == [1, 2]


def test_no_rewrite_or_withdraw(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, _ = register_user(client, "u4", "投票丙")
    assert client.post(f"/api/votes/{vid}/ballots", headers=h,
                       json={"option_ids": [1]}).status_code == 200
    # 改投被拒
    r = client.post(f"/api/votes/{vid}/ballots", headers=h, json={"option_ids": [2]})
    assert r.status_code == 400 and r.json()["detail"] == "你已投票"
    # 无撤销端点：该路径仅注册了 POST，DELETE → 405（Starlette 对已匹配路径的方法不允许返回 405）
    assert client.delete(f"/api/votes/{vid}/ballots", headers=h).status_code == 405


def test_anonymous_vote_shows_anonymous(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, _ = register_user(client, "u5", "面罩侠")
    r = client.post(f"/api/votes/{vid}/ballots", headers=h,
                    json={"option_ids": [1], "anonymous": True})
    assert r.status_code == 200
    opt1 = next(o for o in r.json()["options"] if o["id"] == 1)
    assert opt1["count"] == 1 and opt1["voters"] == ["匿名"]
    # 后端不记录身份 → 本人视角 my_voted 为 False
    assert r.json()["my_voted"] is False and r.json()["my_option_ids"] == []


def test_vote_option_not_in_vote(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, _ = register_user(client, "u6", "乱投")
    assert client.post(f"/api/votes/{vid}/ballots", headers=h,
                       json={"option_ids": [999]}).status_code == 400


def test_close_vote_blocks(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, u = register_user(client, "u7", "迟到的")
    # 非管理员不能关闭
    assert client.post(f"/api/admin/votes/{vid}/close", headers=h).status_code == 403
    r = client.post(f"/api/admin/votes/{vid}/close", headers=admin_headers)
    assert r.status_code == 200 and r.json()["open"] is False
    assert r.json()["closed_at"] is not None
    # 再次关闭 → 400
    assert client.post(f"/api/admin/votes/{vid}/close",
                       headers=admin_headers).status_code == 400
    # 已结束不能投票
    assert client.post(f"/api/votes/{vid}/ballots", headers=h,
                       json={"option_ids": [1]}).status_code == 400


def test_banned_cannot_vote(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    h, u = register_user(client, "u8", "被封的")
    client.post(f"/api/admin/users/{u['id']}/ban", headers=admin_headers)
    assert client.post(f"/api/votes/{vid}/ballots", headers=h,
                       json={"option_ids": [1]}).status_code == 403


def test_list_votes_order(client, admin_headers, db):
    v1 = _create_vote(client, admin_headers, title="第一").json()
    client.post(f"/api/admin/votes/{v1['id']}/close", headers=admin_headers)
    v2 = _create_vote(client, admin_headers, title="第二").json()
    r = client.get("/api/votes", headers=admin_headers)
    assert r.status_code == 200
    assert [v["title"] for v in r.json()] == ["第二", "第一"]  # id desc，打开的在前
    assert r.json()[0]["open"] is True and r.json()[1]["open"] is False


def test_public_vote_endpoints(client, admin_headers, db):
    vid = _create_vote(client, admin_headers).json()["id"]
    bot = {"Authorization": "Bearer change-me-bot-token"}
    # 信息
    r = client.get("/api/public/votes", headers=bot)
    assert r.status_code == 200 and r.json()[0]["id"] == vid
    r = client.get(f"/api/public/votes/{vid}", headers=bot)
    assert r.status_code == 200 and r.json()["title"] == "要不要开荒"
    # 代投（昵称优先）
    register_user(client, "u9", "机器人代投")
    r = client.post(f"/api/public/votes/{vid}/ballots", headers=bot,
                    json={"nickname": "机器人代投", "option_ids": [2]})
    assert r.status_code == 200
    opt2 = next(o for o in r.json()["options"] if o["id"] == 2)
    assert opt2["voters"] == ["机器人代投"]
    # account/nickname 必须二选一
    r = client.post(f"/api/public/votes/{vid}/ballots", headers=bot,
                    json={"option_ids": [1]})
    assert r.status_code == 422


def test_cast_vote_concurrent_race_fallback(client, admin_headers, db):
    """并发兜底：绕过应用层检查插入同选项，commit 唯一约束命中 → 400 而非 500。"""
    from app.models import Vote, VoteBallot
    vid = _create_vote(client, admin_headers).json()["id"]
    h, u = register_user(client, "uX", "并发侠")
    vote = db.get(Vote, vid)
    # db fixture session autoflush=False：直接加票但不 flush，应用层检查（query）看不到
    db.add(VoteBallot(vote_id=vote.id, user_id=u["id"], option_id=1))
    r = client.post(f"/api/votes/{vid}/ballots", headers=h, json={"option_ids": [1]})
    assert r.status_code == 400 and r.json()["detail"] == "你已投票"
    # 回滚后未产生重复计票
    detail = client.get(f"/api/votes/{vid}", headers=h).json()
    assert detail["options"][0]["count"] == 0
