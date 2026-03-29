/**
 * 微信 → Google 转发桥接
 *
 * Google Workspace 不是即时通讯工具，不适合 1:1 消息桥接。
 * 策略：将微信消息作为邮件通知发送到配置的邮箱地址。
 * - message.text → 发送邮件，Subject: "[微信] {fromName}"，Body: 消息内容
 * - 其他消息类型 → 发送提示性邮件
 * - command 类型 → 跳过（由工具系统处理）
 */

import type { GoogleClient } from '../google/client.js';
import type { Store } from '../store.js';
import type { HubEvent, Installation } from '../hub/types.js';

export class WxToGoogle {
  private googleClient: GoogleClient;
  private store: Store;
  /** 通知邮箱地址，微信消息将以邮件形式发送到此地址 */
  private notifyEmail: string | undefined;

  /**
   * @param googleClient Google Workspace 客户端实例
   * @param store 数据存储实例
   * @param notifyEmail 通知邮箱地址（可选，不设置则不发送通知邮件）
   */
  constructor(googleClient: GoogleClient, store: Store, notifyEmail?: string) {
    this.googleClient = googleClient;
    this.store = store;
    this.notifyEmail = notifyEmail;
  }

  /**
   * 处理微信事件，将消息转发为 Gmail 邮件通知
   *
   * @param event Hub 推送的微信事件
   * @param installation 安装实例信息
   */
  async handleWxEvent(event: HubEvent, installation: Installation): Promise<void> {
    const eventData = event.event;
    if (!eventData) {
      console.warn('[WxToGoogle] 事件缺少 event 字段，跳过');
      return;
    }

    // command 类型由工具系统处理，这里跳过
    if (eventData.type === 'command') {
      console.log('[WxToGoogle] 收到 command 事件，跳过（由工具系统处理）');
      return;
    }

    // 仅处理 message 类型
    if (eventData.type !== 'message') {
      console.log(`[WxToGoogle] 忽略非 message 事件: type=${eventData.type}`);
      return;
    }

    // 检查是否配置了通知邮箱
    if (!this.notifyEmail) {
      console.warn('[WxToGoogle] 未配置通知邮箱（notifyEmail），无法发送邮件通知');
      return;
    }

    const data = eventData.data;
    const fromUserId = (data.user_id as string) ?? 'unknown';
    const fromUserName = (data.user_name as string) ?? fromUserId;
    const messageType = (data.type as string) ?? 'text';
    const text = data.text as string | undefined;

    try {
      let subject: string;
      let body: string;

      switch (messageType) {
        case 'text': {
          subject = `[微信] ${fromUserName}`;
          body = text ?? '（空消息）';
          break;
        }
        case 'image': {
          subject = `[微信] ${fromUserName} 发送了图片`;
          body = `${fromUserName} 发送了一张图片。\n\n图片地址: ${(data.image_url as string) ?? '（无法获取）'}`;
          break;
        }
        case 'voice': {
          subject = `[微信] ${fromUserName} 发送了语音`;
          body = `${fromUserName} 发送了一条语音消息。`;
          break;
        }
        case 'video': {
          subject = `[微信] ${fromUserName} 发送了视频`;
          body = `${fromUserName} 发送了一个视频。`;
          break;
        }
        case 'file': {
          const fileName = (data.file_name as string) ?? '未知文件';
          subject = `[微信] ${fromUserName} 发送了文件: ${fileName}`;
          body = `${fromUserName} 发送了文件: ${fileName}\n\n文件地址: ${(data.file_url as string) ?? '（无法获取）'}`;
          break;
        }
        case 'location': {
          subject = `[微信] ${fromUserName} 分享了位置`;
          body = `${fromUserName} 分享了位置信息。\n\n地址: ${(data.address as string) ?? '（无法获取）'}`;
          break;
        }
        default: {
          subject = `[微信] ${fromUserName} 发送了 ${messageType} 类型消息`;
          body = `${fromUserName} 发送了一条 ${messageType} 类型的消息，暂不支持在邮件中展示。`;
          break;
        }
      }

      // 检查是否有历史线程可以回复（同一微信用户的消息归入同一邮件线程）
      const latestLink = this.store.getLatestLinkByWxUser(
        installation.id,
        fromUserId,
      );

      let messageId: string;

      if (latestLink) {
        // 在同一线程中回复，保持对话连续性
        try {
          messageId = await this.googleClient.replyEmail(
            latestLink.googleMsgId,
            body,
          );
        } catch {
          // 回复失败时降级为新建邮件
          console.warn('[WxToGoogle] 回复邮件失败，降级为新建邮件');
          messageId = await this.googleClient.sendEmail(
            this.notifyEmail,
            subject,
            body,
          );
        }
      } else {
        // 新建邮件
        messageId = await this.googleClient.sendEmail(
          this.notifyEmail,
          subject,
          body,
        );
      }

      // 获取邮件详情以获取实际的 threadId
      const detail = await this.googleClient.getEmail(messageId);
      const threadId = detail.threadId ?? messageId;

      // 保存消息关联记录（Gmail 消息 ID → 微信用户映射）
      this.store.saveMessageLink({
        installationId: installation.id,
        googleMsgId: messageId,
        googleThreadId: threadId,
        wxUserId: fromUserId,
        wxUserName: fromUserName,
      });

      console.log(
        `[WxToGoogle] 微信消息已转发为邮件: wxUser=${fromUserName}, gmailMsgId=${messageId}`,
      );
    } catch (err) {
      console.error(
        `[WxToGoogle] 转发微信消息失败: wxUser=${fromUserName}:`,
        err,
      );
    }
  }
}
