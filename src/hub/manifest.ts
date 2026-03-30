/**
 * 应用清单定义
 * 声明应用的基本信息、能力和订阅的事件类型
 */

/** 应用清单结构 */
export interface AppManifest {
  /** 应用唯一标识（URL 友好） */
  slug: string;
  /** 应用显示名称 */
  name: string;
  /** 应用图标（emoji 或 URL） */
  icon: string;
  /** 应用描述 */
  description: string;
  /** 订阅的事件类型列表 */
  events: string[];
  /** 所需权限范围 */
  scopes: string[];
  /** 配置项 JSON Schema */
  config_schema: Record<string, unknown>;
  /** 安装引导说明（Markdown） */
  guide: string;
}

/** Google Workspace 应用清单 */
export const manifest: AppManifest = {
  slug: "google-workspace",
  name: "Google Workspace",
  icon: "🔷",
  description:
    "微信 ↔ Google Workspace 桥接，支持 Gmail、Calendar、Drive、Docs、Sheets",
  events: ["message", "command"],
  scopes: ["tools:write", "config:read"],
  config_schema: {
    type: "object",
    properties: {
      google_client_id: { type: "string", title: "Google Client ID", description: "OAuth 客户端 ID" },
      google_client_secret: { type: "string", title: "Google Client Secret", description: "OAuth 客户端密钥" },
      google_refresh_token: { type: "string", title: "Google Refresh Token", description: "OAuth Refresh Token（预先通过授权流程获取）" },
    },
    required: ["google_client_id", "google_client_secret", "google_refresh_token"],
  },
  guide: `## Google Workspace 安装指南
### 第 1 步：创建 GCP 项目
1. 访问 [console.cloud.google.com](https://console.cloud.google.com)
2. 创建项目 → 启用 Gmail/Calendar/Drive/Sheets API
### 第 2 步：创建 OAuth 凭证
API 和服务 → 凭据 → 创建 OAuth 客户端 ID（桌面应用类型）
### 第 3 步：获取 Refresh Token
使用 OAuth Playground 或 gws CLI 完成授权，获取 refresh_token
### 第 4 步：填写上方配置并安装
`,
};
