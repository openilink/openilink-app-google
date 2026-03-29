/**
 * Gmail 轮询事件系统
 *
 * Google Workspace 没有像 Slack/Discord 那样的实时事件推送（WebSocket/Gateway）。
 * Gmail 有 watch API（基于 Pub/Sub）但配置复杂，需要 Google Cloud 项目。
 * 这里采用简化方案：定期轮询检查新邮件。
 */
import type { GoogleClient } from './client.js';

/** Gmail 邮件事件 */
export interface GoogleMailEvent {
  /** Gmail 消息 ID */
  messageId: string;
  /** Gmail 线程 ID */
  threadId: string;
  /** 发件人 */
  from: string;
  /** 邮件主题 */
  subject: string;
  /** 邮件正文（纯文本） */
  body: string;
  /** 邮件日期 */
  date: string;
}

/** 新邮件回调处理函数 */
export type GoogleMailHandler = (
  event: GoogleMailEvent,
) => void | Promise<void>;

/**
 * 从 Gmail 消息的 payload 中提取纯文本正文
 * 支持多 part 递归解析
 */
function extractBody(payload: any): string {
  // 直接包含 body data 的简单消息
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // 多 part 消息，递归查找 text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      // 递归处理嵌套 part（如 multipart/alternative 内部）
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }

    // 没找到 text/plain，尝试 text/html 作为 fallback
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }

  return '';
}

/**
 * 从 headers 数组中获取指定头字段的值
 */
function getHeader(headers: any[], name: string): string {
  const header = headers?.find(
    (h: any) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? '';
}

/**
 * 启动 Gmail 轮询
 *
 * 每隔指定时间检查是否有新邮件（使用 after: 时间戳搜索），
 * 并对新邮件调用回调函数。
 *
 * @param client GoogleClient 实例
 * @param onNewMail 新邮件回调
 * @param intervalMs 轮询间隔（毫秒），默认 30000（30 秒）
 * @returns 包含 stop 方法的对象，用于停止轮询
 */
export function startGmailPolling(
  client: GoogleClient,
  onNewMail: GoogleMailHandler,
  intervalMs?: number,
): { stop: () => void } {
  const interval = intervalMs ?? 30_000;
  // 已处理过的消息 ID 集合，避免重复通知
  const processedIds = new Set<string>();
  // 记录上次轮询的时间戳（秒），用于 after: 查询
  let lastCheckTimestamp = Math.floor(Date.now() / 1000);
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = true;

  /**
   * 执行一次轮询检查
   */
  async function poll(): Promise<void> {
    if (!running) return;

    try {
      // 使用 after: 搜索语法仅获取上次检查之后的邮件
      const query = `after:${lastCheckTimestamp}`;
      const messages = await client.listEmails(query, 20);

      if (messages.length === 0) return;

      // 更新时间戳
      const now = Math.floor(Date.now() / 1000);

      for (const msg of messages) {
        const msgId = msg.id as string;

        // 跳过已处理的消息
        if (processedIds.has(msgId)) continue;
        processedIds.add(msgId);

        try {
          // 获取邮件详情
          const detail = await client.getEmail(msgId);
          const headers = detail.payload?.headers ?? [];

          const event: GoogleMailEvent = {
            messageId: msgId,
            threadId: detail.threadId ?? '',
            from: getHeader(headers, 'From'),
            subject: getHeader(headers, 'Subject'),
            body: extractBody(detail.payload ?? {}),
            date: getHeader(headers, 'Date'),
          };

          // 调用回调
          await onNewMail(event);
        } catch (err) {
          console.error(
            `[GmailPolling] 处理邮件 ${msgId} 失败:`,
            err,
          );
        }
      }

      // 更新到当前时间
      lastCheckTimestamp = now;
    } catch (err) {
      console.error('[GmailPolling] 轮询失败:', err);
    }
  }

  // 立即执行一次（仅标记现有邮件为已处理，不触发回调）
  (async () => {
    try {
      const existing = await client.listEmails(undefined, 50);
      for (const msg of existing) {
        processedIds.add(msg.id as string);
      }
      console.log(
        `[GmailPolling] 初始化完成，已标记 ${processedIds.size} 封已有邮件`,
      );
    } catch (err) {
      console.error('[GmailPolling] 初始化失败:', err);
    }

    // 开始定时轮询
    timer = setInterval(() => {
      poll().catch((err) =>
        console.error('[GmailPolling] 轮询异常:', err),
      );
    }, interval);

    console.log(
      `[GmailPolling] 轮询已启动，间隔 ${interval}ms`,
    );
  })();

  return {
    /** 停止轮询 */
    stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      console.log('[GmailPolling] 轮询已停止');
    },
  };
}
