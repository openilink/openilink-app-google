/**
 * Google → 微信转发桥接
 *
 * 当收到新 Gmail 邮件时，查找 store 中的消息映射关系，
 * 通过 HubClient 将邮件内容通知到对应的微信用户。
 */

import { HubClient } from '../hub/client.js';
import type { Store } from '../store.js';
import type { Installation } from '../hub/types.js';
import type { GoogleMailEvent } from '../google/event.js';

export class GoogleToWx {
  private store: Store;

  /**
   * @param store 数据存储实例
   */
  constructor(store: Store) {
    this.store = store;
  }

  /**
   * 处理新邮件事件
   * 遍历所有安装实例，查找关联的微信用户并推送通知
   *
   * @param event Gmail 新邮件事件
   * @param installations 所有安装实例列表
   */
  async handleNewMail(
    event: GoogleMailEvent,
    installations: Installation[],
  ): Promise<void> {
    if (installations.length === 0) {
      console.warn('[GoogleToWx] 没有安装实例，跳过通知');
      return;
    }

    // 格式化通知消息
    const notification = this.formatNotification(event);

    for (const installation of installations) {
      try {
        const hubClient = new HubClient(
          installation.hubUrl,
          installation.appToken,
        );

        // 尝试通过消息 ID 精确匹配（邮件回复场景）
        const linkByMsg = this.store.getMessageLinkByGoogleMsg(event.messageId, installation.id);
        if (linkByMsg) {
          await hubClient.sendText(
            installation.botId,
            linkByMsg.wxUserId,
            notification,
          );
          console.log(
            `[GoogleToWx] 已通知用户 ${linkByMsg.wxUserName}（精确匹配），邮件: ${event.subject}`,
          );
          continue;
        }

        // 尝试通过线程 ID 匹配（同一邮件线程中的新消息）
        if (event.threadId) {
          const linkByThread = this.findLinkByThreadId(
            installation.id,
            event.threadId,
          );
          if (linkByThread) {
            await hubClient.sendText(
              installation.botId,
              linkByThread.wxUserId,
              notification,
            );
            console.log(
              `[GoogleToWx] 已通知用户 ${linkByThread.wxUserName}（线程匹配），邮件: ${event.subject}`,
            );
            continue;
          }
        }

        // 无关联记录，记录日志但不发送（避免骚扰无关用户）
        console.log(
          `[GoogleToWx] 新邮件无关联用户，跳过推送: from=${event.from}, subject=${event.subject}`,
        );
      } catch (err) {
        console.error(
          `[GoogleToWx] 推送通知失败，installation=${installation.id}:`,
          err,
        );
      }
    }
  }

  /**
   * 通过线程 ID 查找消息关联记录
   * 遍历线程中的所有已知消息，返回第一个匹配的关联记录
   *
   * @param installationId 安装实例 ID
   * @param threadId Gmail 线程 ID
   * @returns 消息关联记录，未找到返回 undefined
   */
  private findLinkByThreadId(
    installationId: string,
    threadId: string,
  ) {
    // 通过 threadId 查找关联记录
    // 由于 Store 目前只支持按 googleMsgId 查询，
    // 这里利用 threadId 与 googleThreadId 的对应关系
    // 注意：当前 Store 没有 byThreadId 查询方法，先通过 byMsgId 兜底
    const link = this.store.getMessageLinkByGoogleMsg(threadId, installationId);
    if (link) {
      return link;
    }
    return undefined;
  }

  /**
   * 格式化邮件通知消息
   * 生成适合在微信中显示的文本摘要
   */
  private formatNotification(event: GoogleMailEvent): string {
    const lines = [
      `📧 新邮件通知`,
      `发件人: ${event.from}`,
      `主题: ${event.subject}`,
      `时间: ${event.date}`,
    ];

    // 添加正文摘要（最多 200 字，避免微信消息过长）
    const body = event.body?.trim() ?? '';
    if (body) {
      const snippet = body.length > 200 ? body.slice(0, 200) + '...' : body;
      lines.push('---', snippet);
    }

    return lines.join('\n');
  }
}
