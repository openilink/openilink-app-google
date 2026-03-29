/**
 * Google Calendar 工具模块
 * 提供日程的查看、创建、删除及忙闲查询功能
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: GoogleClient) => Map<string, ToolHandler>;
}

/** Calendar 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: 'list_events',
    description: '查看日程',
    command: 'list_events',
    parameters: {
      start_time: { type: 'string', description: '开始时间，ISO格式', required: false },
      end_time: { type: 'string', description: '结束时间，ISO格式', required: false },
      count: { type: 'number', description: '返回日程数量', required: false },
    },
  },
  {
    name: 'create_event',
    description: '创建日程',
    command: 'create_event',
    parameters: {
      summary: { type: 'string', description: '日程标题', required: true },
      start_time: { type: 'string', description: '开始时间，ISO格式', required: true },
      end_time: { type: 'string', description: '结束时间，ISO格式', required: true },
      description: { type: 'string', description: '日程描述', required: false },
      attendees: { type: 'string', description: '参与者邮箱，逗号分隔', required: false },
    },
  },
  {
    name: 'delete_event',
    description: '删除日程',
    command: 'delete_event',
    parameters: {
      event_id: { type: 'string', description: '日程ID', required: true },
    },
  },
  {
    name: 'get_free_busy',
    description: '查询忙闲状态',
    command: 'get_free_busy',
    parameters: {
      emails: { type: 'string', description: '要查询的邮箱地址，逗号分隔', required: true },
      start_time: { type: 'string', description: '查询开始时间，ISO格式', required: true },
      end_time: { type: 'string', description: '查询结束时间，ISO格式', required: true },
    },
  },
];

/**
 * 创建 Calendar 工具处理器
 * @param client Google API 客户端实例
 */
function createHandlers(client: GoogleClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 查看日程
  handlers.set('list_events', async (ctx) => {
    try {
      const { start_time, end_time, count } = ctx.args;
      const events = await client.listEvents(start_time, end_time, count);
      if (events.length === 0) {
        return '当前时间范围内没有日程';
      }
      return `找到 ${events.length} 个日程:\n${JSON.stringify(events, null, 2)}`;
    } catch (error) {
      return `获取日程列表失败: ${(error as Error).message}`;
    }
  });

  // 创建日程
  handlers.set('create_event', async (ctx) => {
    try {
      const { summary, start_time, end_time, description, attendees } = ctx.args;
      // 将逗号分隔的邮箱字符串转为数组
      const attendeeList = attendees
        ? attendees.split(',').map((e: string) => e.trim())
        : undefined;
      const event = await client.createEvent(
        summary,
        start_time,
        end_time,
        description,
        attendeeList,
      );
      return `日程已创建成功:\n${JSON.stringify(event, null, 2)}`;
    } catch (error) {
      return `创建日程失败: ${(error as Error).message}`;
    }
  });

  // 删除日程
  handlers.set('delete_event', async (ctx) => {
    try {
      const { event_id } = ctx.args;
      await client.deleteEvent(event_id);
      return `日程已成功删除，事件ID: ${event_id}`;
    } catch (error) {
      return `删除日程失败: ${(error as Error).message}`;
    }
  });

  // 查询忙闲
  handlers.set('get_free_busy', async (ctx) => {
    try {
      const { emails, start_time, end_time } = ctx.args;
      // 将逗号分隔的邮箱字符串转为数组
      const emailList = emails.split(',').map((e: string) => e.trim());
      const result = await client.getFreeBusy(emailList, start_time, end_time);
      return `忙闲查询结果:\n${JSON.stringify(result, null, 2)}`;
    } catch (error) {
      return `查询忙闲状态失败: ${(error as Error).message}`;
    }
  });

  return handlers;
}

export const calendarTools: ToolModule = { definitions, createHandlers };
