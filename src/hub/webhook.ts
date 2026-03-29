/**
 * Webhook 处理逻辑
 * 负责接收 Hub 推送事件、验证签名、分发处理
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifySignature } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { HubEvent } from "./types.js";

/**
 * 从 IncomingMessage 中读取完整的请求体
 * @returns 原始请求体 Buffer
 */
export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * 事件处理回调类型
 * 当收到有效事件后，由外部逻辑处理具体业务
 */
export type EventHandler = (
  event: HubEvent,
  installationId: string,
) => Promise<void>;

/**
 * 处理来自 Hub 的 Webhook 请求
 *
 * 流程：
 * 1. 读取请求体
 * 2. 解析 JSON 获取 installation_id
 * 3. 查找对应的安装信息
 * 4. 验证 Webhook 签名
 * 5. 处理 url_verification 挑战
 * 6. 分发给业务处理函数
 */
export async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  onEvent: EventHandler,
): Promise<void> {
  try {
    // 读取原始请求体
    const rawBody = await readBody(req);
    const bodyStr = rawBody.toString("utf-8");

    // 解析事件内容
    let event: HubEvent;
    try {
      event = JSON.parse(bodyStr) as HubEvent;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "无效的 JSON 格式" }));
      return;
    }

    // 查找安装信息
    const installationId = event.installation_id;
    if (!installationId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少 installation_id" }));
      return;
    }

    const installation = store.getInstallation(installationId);
    if (!installation) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "未找到安装信息" }));
      return;
    }

    // 验证 Webhook 签名
    const signature = req.headers["x-webhook-signature"] as string;
    if (!verifySignature(rawBody, signature, installation.webhookSecret)) {
      console.warn(
        `[Webhook] 签名验证失败: installation_id=${installationId}`,
      );
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "签名验证失败" }));
      return;
    }

    // 处理 URL 验证（Hub 安装时的握手验证）
    if (event.type === "url_verification" && event.challenge) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ challenge: event.challenge }));
      return;
    }

    // 分发事件给业务处理函数
    await onEvent(event, installationId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("[Webhook] 处理异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部服务器错误" }));
  }
}
