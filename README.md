# @openilink/app-google

微信 ↔ Google Workspace 桥接应用 + 18 个 AI Tools。

将微信与 Google Workspace 生态（Gmail、Calendar、Drive、Docs、Sheets）打通，让 AI 助手能够操作 Google Workspace 全套服务。

## 特色

- **Gmail 收发邮件** — 发送、列表、搜索、查看详情、回复邮件
- **Calendar 日程管理** — 查看日程、创建事件、删除事件、查询忙闲
- **Drive 文件管理** — 列出文件、搜索文件、创建文件夹
- **Docs 文档创建** — 创建 Google 文档、读取文档内容
- **Sheets 表格读写** — 读取、写入、追加表格数据
- **Google Chat** — 发送聊天消息（需额外配置 Chat Bot）

> **注意**：Google Workspace 不是即时通讯工具，桥接模式为「微信消息 → 邮件通知」和「新邮件 → 微信通知」，而非实时双向消息同步。Gmail 新邮件检测采用轮询机制（默认 30 秒间隔），非 WebSocket 实时推送。

## 快速开始

### 1. Google Cloud 配置

1. 前往 [GCP Console](https://console.cloud.google.com/) 创建项目
2. 启用以下 API：
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Docs API
   - Google Sheets API
3. 创建 OAuth 2.0 客户端凭据（类型选择「桌面应用」或「Web 应用」）
4. 获取 `client_id` 和 `client_secret`
5. 使用 [OAuth Playground](https://developers.google.com/oauthplayground/) 或自行实现获取 `refresh_token`，授权范围：
   ```
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/documents
   https://www.googleapis.com/auth/spreadsheets
   ```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入配置
```

### 3. 启动

```bash
# 开发模式
npm run dev

# 生产模式
npm run build && npm start

# Docker
docker compose up -d
```

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `HUB_URL` | 是 | - | Hub 服务地址 |
| `BASE_URL` | 是 | - | 本应用对外可访问的基础 URL |
| `GOOGLE_CLIENT_ID` | 是 | - | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 是 | - | Google OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN` | 是 | - | Google OAuth Refresh Token（预先获取） |
| `GOOGLE_REDIRECT_URI` | 否 | `http://localhost:8086/google/callback` | Google OAuth 回调地址 |
| `DB_PATH` | 否 | `data/google.db` | SQLite 数据库文件路径 |
| `PORT` | 否 | `8086` | HTTP 服务端口 |

## 18 个 AI Tools

### Gmail（5 个）

| 工具 | 说明 |
|---|---|
| `send_email` | 发送邮件 |
| `list_emails` | 查看邮件列表 |
| `get_email` | 读取邮件详情 |
| `reply_email` | 回复邮件 |
| `search_emails` | 搜索邮件 |

### Calendar（4 个）

| 工具 | 说明 |
|---|---|
| `list_events` | 查看日程 |
| `create_event` | 创建日程 |
| `delete_event` | 删除日程 |
| `get_free_busy` | 查询忙闲状态 |

### Drive（3 个）

| 工具 | 说明 |
|---|---|
| `list_files` | 列出文件 |
| `search_files` | 搜索文件 |
| `create_folder` | 创建文件夹 |

### Docs（2 个）

| 工具 | 说明 |
|---|---|
| `create_doc` | 创建文档 |
| `get_doc` | 读取文档 |

### Sheets（3 个）

| 工具 | 说明 |
|---|---|
| `read_sheet` | 读取表格 |
| `write_sheet` | 写入表格 |
| `append_sheet` | 追加数据到表格 |

### Chat（1 个）

| 工具 | 说明 |
|---|---|
| `send_chat_message` | 发送 Google Chat 消息 |

## Google Cloud 配置指南

### 创建 OAuth 凭据

1. 进入 [API 和服务 > 凭据](https://console.cloud.google.com/apis/credentials)
2. 点击「创建凭据」→「OAuth 客户端 ID」
3. 应用类型选择「Web 应用」（如果有回调 URL）或「桌面应用」
4. 记录生成的 `Client ID` 和 `Client Secret`

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

### 启用 API

在 GCP Console 中启用以下 API：

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
- [Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
- [Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)

## 开发

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

## 安全与隐私

### 数据处理说明

- **消息内容不落盘**：本 App 在转发消息时，消息内容仅在内存中中转，**不会存储到数据库或磁盘**
- **仅保存消息 ID 映射**：数据库中只保存消息 ID 的对应关系（用于回复路由），不保存消息正文
- **用户数据严格隔离**：所有数据库查询均按 `installation_id` + `user_id` 双重过滤，不同用户之间完全隔离，无法互相访问

### 应用市场安装（托管模式）

通过 OpeniLink Hub 应用市场一键安装时，消息将通过我们的服务器中转。我们承诺：

- 不会记录、存储或分析用户的消息内容
- 不会将用户数据用于任何第三方用途
- 所有 App 代码完全开源，接受社区审查
- 我们会对每个上架的 App 进行严格的安全审查

### 自部署（推荐注重隐私的用户）

如果您对数据隐私有更高要求，建议自行部署本 App：

```bash
# Docker 部署
docker compose up -d

# 或源码运行
npm install && npm run build && npm start
```

自部署后所有数据仅在您自己的服务器上流转，不经过任何第三方。

## License

MIT
