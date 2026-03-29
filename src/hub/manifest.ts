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
}

/** Google Workspace 应用清单 */
export const manifest: AppManifest = {
  slug: "google-workspace",
  name: "Google Workspace",
  icon: "🔷",
  description:
    "微信 ↔ Google Workspace 桥接，支持 Gmail、Calendar、Drive、Docs、Sheets",
  events: ["message", "command"],
};
