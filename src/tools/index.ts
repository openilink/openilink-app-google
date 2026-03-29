/**
 * 工具注册中心
 * 汇总所有 Google Workspace 工具模块，提供统一的收集接口
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

import { gmailTools } from './gmail.js';
import { calendarTools } from './calendar.js';
import { driveTools } from './drive.js';
import { docsTools } from './docs.js';
import { sheetsTools } from './sheets.js';
import { chatTools } from './chat.js';

/** 所有工具模块列表 */
const allModules = [
  gmailTools,
  calendarTools,
  driveTools,
  docsTools,
  sheetsTools,
  chatTools,
];

/**
 * 收集所有工具定义和处理器
 * @param client Google API 客户端实例
 * @returns 包含所有工具定义和处理器映射的对象
 */
export function collectAllTools(client: GoogleClient): {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} {
  const definitions: ToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();

  for (const mod of allModules) {
    // 收集工具定义
    definitions.push(...mod.definitions);

    // 收集处理器
    const moduleHandlers = mod.createHandlers(client);
    for (const [name, handler] of moduleHandlers) {
      handlers.set(name, handler);
    }
  }

  return { definitions, handlers };
}
