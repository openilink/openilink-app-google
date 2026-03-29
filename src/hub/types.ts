/**
 * Hub App 协议相关类型定义
 * 所有 id 字段均使用 string 类型
 */

/** Hub 推送过来的事件结构 */
export interface HubEvent {
  /** 协议版本 */
  v: string;
  /** 事件类型：event / url_verification */
  type: string;
  /** 追踪 ID，用于日志关联 */
  trace_id: string;
  /** URL 验证时的挑战值 */
  challenge?: string;
  /** 安装实例 ID */
  installation_id: string;
  /** 触发事件的 Bot 信息 */
  bot: {
    id: string;
  };
  /** 具体事件内容 */
  event?: {
    /** 事件子类型，如 message / command */
    type: string;
    /** 事件唯一 ID */
    id: string;
    /** 事件时间戳 */
    timestamp: string;
    /** 事件数据负载 */
    data: Record<string, any>;
  };
}

/** 安装实例信息 */
export interface Installation {
  /** 安装实例唯一 ID */
  id: string;
  /** Hub 服务地址 */
  hubUrl: string;
  /** 应用 ID */
  appId: string;
  /** Bot ID */
  botId: string;
  /** 应用令牌，用于调用 Hub API */
  appToken: string;
  /** Webhook 签名密钥 */
  webhookSecret: string;
  /** 创建时间 */
  createdAt?: string;
}

/** 消息关联记录，用于追踪 Google 消息与微信用户的映射 */
export interface MessageLink {
  /** 自增主键 */
  id?: number;
  /** 所属安装实例 ID */
  installationId: string;
  /** Google 消息 ID（如 Gmail Message ID） */
  googleMsgId: string;
  /** Google 线程 ID（如 Gmail Thread ID） */
  googleThreadId: string;
  /** 微信用户 ID */
  wxUserId: string;
  /** 微信用户名 */
  wxUserName: string;
  /** 创建时间 */
  createdAt?: string;
}

/** 工具定义，用于注册可供调用的工具 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具对应的指令 */
  command: string;
  /** 工具参数 Schema */
  parameters?: Record<string, any>;
}

/** 工具调用上下文 */
export interface ToolContext {
  /** 安装实例 ID */
  installationId: string;
  /** Bot ID */
  botId: string;
  /** 用户 ID */
  userId: string;
  /** 追踪 ID */
  traceId: string;
  /** 调用参数 */
  args: Record<string, any>;
}

/** 工具处理函数类型 */
export type ToolHandler = (ctx: ToolContext) => Promise<string>;
