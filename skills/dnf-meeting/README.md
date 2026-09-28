# dnf-meeting · AstrBot 技能

让 AstrBot 机器人按群友消息（「当前投票 / 投票结果 / （账号或昵称）投（选项）」）查询 DNfer 秘党会议当前的投票与结果，并替玩家投票。

要求 **AstrBot v4.13.0+**（支持 Anthropic Skills）。

## 安装

1. 把 `dnf-meeting/` 目录打成 zip（zip 内须含 `SKILL.md`，文件名大小写完全一致）。
2. AstrBot 管理面板 → 插件 → 技能（`/extension/skills`）→ 上传技能，选择该 zip。
3. 按需重载/启用。

## 环境变量

在 AstrBot 运行环境设置：

| 变量 | 说明 | 默认 |
|---|---|---|
| `DNFER_API_BASE` | DNfer 后端地址 | `http://127.0.0.1:8000` |
| `DNFER_API_TOKEN` | DNfer 机器人 API Token（与仓库 `.env` 的 `DNFER_API_TOKEN` 一致） | 必填 |

## 同机部署说明

DNfer 后端容器绑定 `127.0.0.1:8000`（仅宿主机可达）。AstrBot 须以**宿主机进程**（或 host 网络）运行，`127.0.0.1:8000` 才能直达后端内网端口，从而绕过 nginx 的 UA 拦截与限流。若 AstrBot 本身容器化，需把 `DNFER_API_BASE` 改为宿主机 IP，或改走 `https://<域名>`。

## 自测

先启动 DNfer 后端，再直跑脚本：

```bash
cd dnf-meeting
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnf_meeting.py current
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnf_meeting.py list
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnf_meeting.py vote 872557240 打
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnf_meeting.py vote 872557240 打 周六
```

> 机器人代投恒为实名投票（群聊公开，不提供匿名）。

- stdout 为机器可读 JSON；stderr 为中文摘要。
- 命令失败时退出码非 0，stdout 为 `{"ok":false,...}`。

## 目录结构

```
dnf-meeting/
├── SKILL.md              # Anthropic Skills 指令（frontmatter: name + description）
├── scripts/dnf_meeting.py # 自包含 Python 助手（仅 stdlib urllib，零依赖）
└── README.md             # 本文档
```
