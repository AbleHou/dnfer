# dnfer-characters · AstrBot 技能

让 AstrBot 机器人把群友发的「DNfer 账号或昵称 + 角色截图/文字描述」自动录入 DNfer 系统，并支持按账号或昵称查询角色。

要求 **AstrBot v4.13.0+**（支持 Anthropic Skills）。

## 安装

1. 把 `dnfer-characters/` 目录打成 zip（zip 内须含 `SKILL.md`，文件名大小写完全一致）。
2. AstrBot 管理面板 → 插件 → 技能（`/extension/skills`）→ 上传技能，选择该 zip。
3. 按需重载/启用。

## 环境变量

在 AstrBot 运行环境设置：

| 变量 | 说明 | 默认 |
|---|---|---|
| `DNFER_API_BASE` | DNfer 后端地址 | `http://127.0.0.1:8000` |
| `DNFER_API_TOKEN` | DNfer 机器人 API Token（与仓库 `.env` 的 `DNFER_API_TOKEN` 一致） | 必填 |

## 同机部署说明

DNfer 后端容器绑定 `127.0.0.1:8000`（仅宿主机可达）。AstrBot 须以**宿主机进程**（或 host 网络）运行，`127.0.0.1:8000` 才能直达后端内网端口，从而绕过 nginx 的 UA 拦截与限流。若 AstrBot 本身容器化，需把 `DNFER_API_BASE` 改为宿主机 IP，或改走 `https://<域名>`（注意 nginx 会拦截含 `curl`/`wget`/`python-requests` 的 UA）。

## 自测

先启动 DNfer 后端，再直跑脚本（以下命令假设 `zhangsan` / `张三` 已在系统注册，未注册会返回 404）：

```bash
cd dnfer-characters
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add zhangsan '[{"name":"剑魂","fame":210000}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add 张三 '[{"name":"鬼泣","job_name":"soul_bender"}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add --by-nickname 张三 '[{"name":"奶妈","job_name":"crusader_female"}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py add --by-account zhangsan '[{"name":"狂战","job_name":"berserker"}]'
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py list 张三
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py list --by-account zhangsan
DNFER_API_BASE=http://127.0.0.1:8000 DNFER_API_TOKEN=<你的token> \
  python scripts/dnfer_api.py register 872557240
```

- stdout 为机器可读 JSON；stderr 为中文摘要。
- 命令失败时退出码非 0，stdout 为 `{"ok":false,...}`。

注册成功后，该 QQ 号即账号=密码=昵称，可用上述 add/list 命令直接录入/查询角色。

## 目录结构

```
dnfer-characters/
├── SKILL.md              # Anthropic Skills 指令（frontmatter: name + description）
├── scripts/dnfer_api.py  # 自包含 Python 助手（仅 stdlib urllib，零依赖）
└── README.md             # 本文档
```
