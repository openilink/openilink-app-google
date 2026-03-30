# @openilink/app-google

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](Dockerfile)

**在微信中操作 Google Workspace — Gmail / Calendar / Drive / Docs / Sheets + 18 个 AI Tools。**

> 本项目是 [OpeniLink Hub](https://github.com/openilink/openilink-hub) 的官方 App。Hub 是开源的微信 Bot 管理平台 + App 应用市场。

## 功能亮点

- **Gmail 收发邮件** — 发送、列表、搜索、查看详情、回复邮件
- **Calendar 日程管理** — 查看日程、创建事件、删除事件、查询忙闲
- **Drive 文件管理** — 列出文件、搜索文件、创建文件夹
- **Docs 文档创建** — 创建 Google 文档、读取文档内容
- **Sheets 表格读写** — 读取、写入、追加表格数据
- **Google Chat** — 发送聊天消息（需额外配置 Chat Bot）

> **注意**：Google Workspace 不是即时通讯工具，桥接模式为「微信消息 → 邮件通知」和「新邮件 → 微信通知」，而非实时双向消息同步。Gmail 新邮件检测采用轮询机制（默认 30 秒间隔），非 WebSocket 实时推送。

## 使用方式

安装到 Bot 后，支持三种方式调用：

### 自然语言（推荐）

直接用微信跟 Bot 对话，Hub AI 会自动识别意图并调用对应功能：

- "发封邮件给 alice@example.com 说项目进展"
- "查一下明天的 Google 日程"
- "帮我在 Google Drive 搜一下 Q1 报告"

### 命令调用

使用 `/命令名 参数` 的格式直接调用：

- `/send_email --to alice@example.com --subject 进展 --body 已完成`

### AI 自动调用

Hub AI 在多轮对话中会自动判断是否需要调用本 App 的功能，无需手动触发。

## AI Tools（18 个）

### Gmail — 5 个

| 工具名 | 说明 |
|--------|------|
| `send_email` | 发送邮件 |
| `list_emails` | 查看邮件列表 |
| `get_email` | 读取邮件详情 |
| `reply_email` | 回复邮件 |
| `search_emails` | 搜索邮件 |

### Calendar — 4 个

| 工具名 | 说明 |
|--------|------|
| `list_events` | 查看日程 |
| `create_event` | 创建日程 |
| `delete_event` | 删除日程 |
| `get_free_busy` | 查询忙闲状态 |

### Drive — 3 个

| 工具名 | 说明 |
|--------|------|
| `list_files` | 列出文件 |
| `search_files` | 搜索文件 |
| `create_folder` | 创建文件夹 |

### Docs — 2 个

| 工具名 | 说明 |
|--------|------|
| `create_doc` | 创建文档 |
| `get_doc` | 读取文档 |

### Sheets — 3 个

| 工具名 | 说明 |
|--------|------|
| `read_sheet` | 读取表格 |
| `write_sheet` | 写入表格 |
| `append_sheet` | 追加数据到表格 |

### Chat — 1 个

| 工具名 | 说明 |
|--------|------|
| `send_chat_message` | 发送 Google Chat 消息 |

## 快速开始 — 应用市场一键安装

1. 打开 [OpeniLink Hub](https://github.com/openilink/openilink-hub) 管理后台
2. 进入 **应用市场**，找到 **Google Workspace**
3. 点击 **安装**，按提示填入 Google OAuth 凭据
4. 安装完成后即可在微信中使用

<details>
<summary><strong>自部署 — Docker</strong></summary>

```bash
# 使用 docker-compose
docker compose up -d
```

或源码运行：

```bash
git clone https://github.com/openilink/openilink-app-google.git
cd openilink-app-google
npm install
cp .env.example .env   # 编辑 .env 填入实际值
npm run dev             # 开发模式
npm run build && npm start  # 生产模式
```

</details>

<details>
<summary><strong>环境变量</strong></summary>

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `HUB_URL` | 是 | — | Hub 服务地址 |
| `BASE_URL` | 是 | — | 本应用对外可访问的基础 URL |
| `GOOGLE_CLIENT_ID` | 是 | — | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 是 | — | Google OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN` | 是 | — | Google OAuth Refresh Token（预先获取） |
| `GOOGLE_REDIRECT_URI` | 否 | `http://localhost:8086/google/callback` | Google OAuth 回调地址 |
| `DB_PATH` | 否 | `data/google.db` | SQLite 数据库文件路径 |
| `PORT` | 否 | `8086` | HTTP 服务端口 |

</details>

<details>
<summary><strong>Google Cloud 配置指南</strong></summary>

### 创建 OAuth 凭据

1. 前往 [GCP Console](https://console.cloud.google.com/) 创建项目
2. 进入 [API 和服务 > 凭据](https://console.cloud.google.com/apis/credentials)
3. 点击「创建凭据」→「OAuth 客户端 ID」
4. 应用类型选择「Web 应用」（如果有回调 URL）或「桌面应用」
5. 记录生成的 `Client ID` 和 `Client Secret`

### 启用 API

在 GCP Console 中启用以下 API：

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
- [Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
- [Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)

### 获取 Refresh Token

**方式一：OAuth Playground**

1. 访问 [OAuth Playground](https://developers.google.com/oauthplayground/)
2. 点击右上角齿轮图标，勾选「Use your own OAuth credentials」
3. 填入 Client ID 和 Client Secret
4. 在左侧选择需要的 API scope，点击「Authorize APIs」
5. 完成授权后，点击「Exchange authorization code for tokens」
6. 复制 `refresh_token`

**方式二：自行实现 OAuth 流程**

1. 构造授权 URL 并引导用户访问
2. 用户同意后获取 `authorization_code`
3. 用 code 换取 `access_token` + `refresh_token`

需要的授权范围：

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
```

</details>

<details>
<summary><strong>开发指南</strong></summary>

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 开发模式（热重载）
npm run dev

# 编译
npm run build
```

</details>

## 安全与隐私

- **消息内容不落盘** — 消息内容仅在内存中中转，不会存储到数据库或磁盘
- **仅保存消息 ID 映射** — 数据库中只保存消息 ID 对应关系（用于回复路由），不保存消息正文
- **用户数据严格隔离** — 所有查询均按 `installation_id` + `user_id` 双重过滤，不同用户之间完全隔离
- **应用市场安装（托管模式）** — 不会记录、存储或分析用户的消息内容；所有代码完全开源，接受社区审查
- **自部署** — 如需更高隐私保障，可自行部署，所有数据仅在您自己的服务器上流转

## License

MIT
