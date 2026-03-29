/**
 * Gmail 工具模块
 * 提供邮件的发送、列表、详情、回复、搜索功能
 */

import type { ToolDefinition, ToolHandler } from '../hub/types.js';
import type { GoogleClient } from '../google/client.js';

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: GoogleClient) => Map<string, ToolHandler>;
}

/** Gmail 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: 'send_email',
    description: '发送邮件',
    command: 'send_email',
    parameters: {
      to: { type: 'string', description: '收件人邮箱地址', required: true },
      subject: { type: 'string', description: '邮件主题', required: true },
      body: { type: 'string', description: '邮件正文', required: true },
      html: { type: 'boolean', description: '是否以HTML格式发送', required: false },
    },
  },
  {
    name: 'list_emails',
    description: '查看邮件列表',
    command: 'list_emails',
    parameters: {
      query: { type: 'string', description: 'Gmail查询语法，如"is:unread"', required: false },
      count: { type: 'number', description: '返回邮件数量，默认10', required: false },
    },
  },
  {
    name: 'get_email',
    description: '读取邮件详情',
    command: 'get_email',
    parameters: {
      message_id: { type: 'string', description: '邮件ID', required: true },
    },
  },
  {
    name: 'reply_email',
    description: '回复邮件',
    command: 'reply_email',
    parameters: {
      message_id: { type: 'string', description: '要回复的邮件ID', required: true },
      body: { type: 'string', description: '回复内容', required: true },
    },
  },
  {
    name: 'search_emails',
    description: '搜索邮件',
    command: 'search_emails',
    parameters: {
      query: { type: 'string', description: '搜索关键词或Gmail查询语法', required: true },
      count: { type: 'number', description: '返回邮件数量，默认10', required: false },
    },
  },
];

/**
 * 创建 Gmail 工具处理器
 * @param client Google API 客户端实例
 */
function createHandlers(client: GoogleClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 发送邮件
  handlers.set('send_email', async (ctx) => {
    try {
      const { to, subject, body, html } = ctx.args;
      const messageId = await client.sendEmail(to, subject, body, html);
      return `邮件已成功发送，消息ID: ${messageId}`;
    } catch (error) {
      return `发送邮件失败: ${(error as Error).message}`;
    }
  });

  // 查看邮件列表
  handlers.set('list_emails', async (ctx) => {
    try {
      const { query, count } = ctx.args;
      const maxResults = count ?? 10;
      const emails = await client.listEmails(query, maxResults);
      if (emails.length === 0) {
        return '没有找到匹配的邮件';
      }
      return `找到 ${emails.length} 封邮件:\n${JSON.stringify(emails, null, 2)}`;
    } catch (error) {
      return `获取邮件列表失败: ${(error as Error).message}`;
    }
  });

  // 读取邮件详情
  handlers.set('get_email', async (ctx) => {
    try {
      const { message_id } = ctx.args;
      const email = await client.getEmail(message_id);
      return `邮件详情:\n${JSON.stringify(email, null, 2)}`;
    } catch (error) {
      return `获取邮件详情失败: ${(error as Error).message}`;
    }
  });

  // 回复邮件
  handlers.set('reply_email', async (ctx) => {
    try {
      const { message_id, body } = ctx.args;
      const replyId = await client.replyEmail(message_id, body);
      return `邮件已成功回复，消息ID: ${replyId}`;
    } catch (error) {
      return `回复邮件失败: ${(error as Error).message}`;
    }
  });

  // 搜索邮件
  handlers.set('search_emails', async (ctx) => {
    try {
      const { query, count } = ctx.args;
      const maxResults = count ?? 10;
      const emails = await client.listEmails(query, maxResults);
      if (emails.length === 0) {
        return '没有找到匹配的邮件';
      }
      return `搜索到 ${emails.length} 封邮件:\n${JSON.stringify(emails, null, 2)}`;
    } catch (error) {
      return `搜索邮件失败: ${(error as Error).message}`;
    }
  });

  return handlers;
}

export const gmailTools: ToolModule = { definitions, createHandlers };
