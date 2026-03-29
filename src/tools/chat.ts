/**
 * Google Chat 工具模块
 * 提供 Google Chat 消息发送功能（暂未完整实现）
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: GoogleClient) => Map<string, ToolHandler>;
}

/** Chat 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: 'send_chat_message',
    description: '发送Google Chat消息',
    command: 'send_chat_message',
    parameters: {
      space: { type: 'string', description: '聊天空间ID，格式: spaces/SPACE_ID', required: true },
      text: { type: 'string', description: '消息内容', required: true },
    },
  },
];

/**
 * 创建 Chat 工具处理器
 * @param client Google API 客户端实例（当前未使用，预留扩展）
 */
function createHandlers(_client: GoogleClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 发送 Google Chat 消息（暂未实现）
  handlers.set('send_chat_message', async (_ctx) => {
    try {
      return 'Google Chat 消息发送需要额外配置 Chat Bot，当前暂不支持此功能';
    } catch (error) {
      return `发送Chat消息失败: ${(error as Error).message}`;
    }
  });

  return handlers;
}

export const chatTools: ToolModule = { definitions, createHandlers };
