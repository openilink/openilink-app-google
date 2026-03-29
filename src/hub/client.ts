/**
 * Hub API 客户端
 * 封装与 Hub 服务的 HTTP 通信，支持发送文本、图片、文件等消息
 */

/** Hub API 请求超时时间（30 秒） */
const REQUEST_TIMEOUT_MS = 30_000;

/** Hub API 返回的消息结构 */
export interface HubMessageResponse {
  ok: boolean;
  message_id?: string;
  error?: string;
}

/**
 * Hub 客户端，用于向 Hub 发送消息
 */
export class HubClient {
  private hubUrl: string;
  private appToken: string;

  /**
   * @param hubUrl - Hub 服务地址
   * @param appToken - 应用令牌，用于认证
   */
  constructor(hubUrl: string, appToken: string) {
    this.hubUrl = hubUrl.replace(/\/+$/, ""); // 去掉尾部斜杠
    this.appToken = appToken;
  }

  /**
   * 发送文本消息
   * @param botId - Bot ID
   * @param userId - 目标用户 ID
   * @param text - 消息文本内容
   */
  async sendText(
    botId: string,
    userId: string,
    text: string,
  ): Promise<HubMessageResponse> {
    return this.sendMessage(botId, userId, {
      type: "text",
      text,
    });
  }

  /**
   * 发送图片消息
   * @param botId - Bot ID
   * @param userId - 目标用户 ID
   * @param imageUrl - 图片 URL
   * @param caption - 图片说明（可选）
   */
  async sendImage(
    botId: string,
    userId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<HubMessageResponse> {
    return this.sendMessage(botId, userId, {
      type: "image",
      image_url: imageUrl,
      caption,
    });
  }

  /**
   * 发送文件消息
   * @param botId - Bot ID
   * @param userId - 目标用户 ID
   * @param fileUrl - 文件 URL
   * @param fileName - 文件名
   */
  async sendFile(
    botId: string,
    userId: string,
    fileUrl: string,
    fileName: string,
  ): Promise<HubMessageResponse> {
    return this.sendMessage(botId, userId, {
      type: "file",
      file_url: fileUrl,
      file_name: fileName,
    });
  }

  /**
   * 发送通用消息
   * 底层统一的消息发送接口，其他 send* 方法均调用此方法
   *
   * @param botId - Bot ID
   * @param userId - 目标用户 ID
   * @param content - 消息内容对象
   */
  async sendMessage(
    botId: string,
    userId: string,
    content: Record<string, any>,
  ): Promise<HubMessageResponse> {
    const url = `${this.hubUrl}/api/v1/bots/${botId}/messages`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.appToken}`,
        },
        body: JSON.stringify({
          user_id: userId,
          ...content,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[HubClient] 发送消息失败: status=${response.status}, body=${errorText}`,
        );
        return {
          ok: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as HubMessageResponse;
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("[HubClient] 请求超时（30s）");
        return { ok: false, error: "请求超时" };
      }

      console.error("[HubClient] 发送消息异常:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "未知错误",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
