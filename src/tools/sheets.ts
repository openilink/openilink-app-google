/**
 * Google Sheets 工具模块
 * 提供表格的读取、写入、追加功能
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: GoogleClient) => Map<string, ToolHandler>;
}

/** Sheets 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: 'read_sheet',
    description: '读取表格',
    command: 'read_sheet',
    parameters: {
      spreadsheet_id: { type: 'string', description: '表格ID', required: true },
      range: { type: 'string', description: '读取范围，如"Sheet1!A1:D10"', required: true },
    },
  },
  {
    name: 'write_sheet',
    description: '写入表格',
    command: 'write_sheet',
    parameters: {
      spreadsheet_id: { type: 'string', description: '表格ID', required: true },
      range: { type: 'string', description: '写入范围，如"Sheet1!A1:D10"', required: true },
      values: { type: 'string', description: '写入数据，JSON二维数组格式', required: true },
    },
  },
  {
    name: 'append_sheet',
    description: '追加数据到表格',
    command: 'append_sheet',
    parameters: {
      spreadsheet_id: { type: 'string', description: '表格ID', required: true },
      range: { type: 'string', description: '追加范围，如"Sheet1!A1:D10"', required: true },
      values: { type: 'string', description: '追加数据，JSON二维数组格式', required: true },
    },
  },
];

/**
 * 创建 Sheets 工具处理器
 * @param client Google API 客户端实例
 */
function createHandlers(client: GoogleClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 读取表格
  handlers.set('read_sheet', async (ctx) => {
    try {
      const { spreadsheet_id, range } = ctx.args;
      const data = await client.readSheet(spreadsheet_id, range);
      if (data.length === 0) {
        return '表格中没有数据';
      }
      return `表格数据（${data.length}行）:\n${JSON.stringify(data, null, 2)}`;
    } catch (error) {
      return `读取表格失败: ${(error as Error).message}`;
    }
  });

  // 写入表格
  handlers.set('write_sheet', async (ctx) => {
    try {
      const { spreadsheet_id, range, values } = ctx.args;
      // 解析JSON字符串为二维数组
      const parsedValues: any[][] = JSON.parse(values);
      await client.writeSheet(spreadsheet_id, range, parsedValues);
      return `数据已成功写入表格，范围: ${range}`;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return '写入表格失败: values 参数格式错误，请提供合法的JSON二维数组';
      }
      return `写入表格失败: ${(error as Error).message}`;
    }
  });

  // 追加数据
  handlers.set('append_sheet', async (ctx) => {
    try {
      const { spreadsheet_id, range, values } = ctx.args;
      // 解析JSON字符串为二维数组
      const parsedValues: any[][] = JSON.parse(values);
      await client.appendSheet(spreadsheet_id, range, parsedValues);
      return `数据已成功追加到表格，范围: ${range}`;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return '追加数据失败: values 参数格式错误，请提供合法的JSON二维数组';
      }
      return `追加数据失败: ${(error as Error).message}`;
    }
  });

  return handlers;
}

export const sheetsTools: ToolModule = { definitions, createHandlers };
