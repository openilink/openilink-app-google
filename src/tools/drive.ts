/**
 * Google Drive 工具模块
 * 提供文件列表、搜索、创建文件夹功能
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: GoogleClient) => Map<string, ToolHandler>;
}

/** Drive 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: 'list_files',
    description: '列出文件',
    command: 'list_files',
    parameters: {
      query: { type: 'string', description: 'Drive查询语法', required: false },
      count: { type: 'number', description: '返回文件数量', required: false },
    },
  },
  {
    name: 'search_files',
    description: '搜索文件',
    command: 'search_files',
    parameters: {
      name: { type: 'string', description: '文件名关键词', required: true },
    },
  },
  {
    name: 'create_folder',
    description: '创建文件夹',
    command: 'create_folder',
    parameters: {
      name: { type: 'string', description: '文件夹名称', required: true },
      parent_id: { type: 'string', description: '父文件夹ID', required: false },
    },
  },
];

/**
 * 创建 Drive 工具处理器
 * @param client Google API 客户端实例
 */
function createHandlers(client: GoogleClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出文件
  handlers.set('list_files', async (ctx) => {
    try {
      const { query, count } = ctx.args;
      const files = await client.listFiles(query, count);
      if (files.length === 0) {
        return '没有找到匹配的文件';
      }
      return `找到 ${files.length} 个文件:\n${JSON.stringify(files, null, 2)}`;
    } catch (error) {
      return `获取文件列表失败: ${(error as Error).message}`;
    }
  });

  // 搜索文件
  handlers.set('search_files', async (ctx) => {
    try {
      const { name } = ctx.args;
      const files = await client.searchFiles(name);
      if (files.length === 0) {
        return `没有找到名为"${name}"的文件`;
      }
      return `搜索到 ${files.length} 个文件:\n${JSON.stringify(files, null, 2)}`;
    } catch (error) {
      return `搜索文件失败: ${(error as Error).message}`;
    }
  });

  // 创建文件夹
  handlers.set('create_folder', async (ctx) => {
    try {
      const { name, parent_id } = ctx.args;
      const folderId = await client.createFolder(name, parent_id);
      return `文件夹已创建成功，文件夹ID: ${folderId}`;
    } catch (error) {
      return `创建文件夹失败: ${(error as Error).message}`;
    }
  });

  return handlers;
}

export const driveTools: ToolModule = { definitions, createHandlers };
