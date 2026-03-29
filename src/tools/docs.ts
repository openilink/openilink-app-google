/**
 * Google Docs 工具模块
 * 提供文档的创建和读取功能
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: GoogleClient) => Map<string, ToolHandler>;
}

/** Docs 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: 'create_doc',
    description: '创建文档',
    command: 'create_doc',
    parameters: {
      title: { type: 'string', description: '文档标题', required: true },
    },
  },
  {
    name: 'get_doc',
    description: '读取文档',
    command: 'get_doc',
    parameters: {
      document_id: { type: 'string', description: '文档ID', required: true },
    },
  },
];

/**
 * 创建 Docs 工具处理器
 * @param client Google API 客户端实例
 */
function createHandlers(client: GoogleClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 创建文档
  handlers.set('create_doc', async (ctx) => {
    try {
      const { title } = ctx.args;
      const result = await client.createDoc(title);
      return `文档已创建成功，文档ID: ${result.docId}，链接: ${result.url}`;
    } catch (error) {
      return `创建文档失败: ${(error as Error).message}`;
    }
  });

  // 读取文档
  handlers.set('get_doc', async (ctx) => {
    try {
      const { document_id } = ctx.args;
      const doc = await client.getDoc(document_id);
      return `文档内容:\n${JSON.stringify(doc, null, 2)}`;
    } catch (error) {
      return `读取文档失败: ${(error as Error).message}`;
    }
  });

  return handlers;
}

export const docsTools: ToolModule = { definitions, createHandlers };
