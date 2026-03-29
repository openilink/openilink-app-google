/**
 * Google Workspace Bridge 集成测试
 *
 * 测试 Hub <-> App 的完整通信链路，不依赖 Google SDK：
 * 1. Mock Hub Server 模拟 OpeniLink Hub
 * 2. 创建轻量 App HTTP 服务器（仅含 webhook handler）
 * 3. 使用内存 SQLite 存储 + Mock GoogleClient
 * 4. 验证微信->Google（邮件通知）和 Google->微信 的双向桥接
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { Store } from "../../src/store.js";
import { handleWebhook } from "../../src/hub/webhook.js";
import { WxToGoogle } from "../../src/bridge/wx-to-google.js";
import { GoogleToWx } from "../../src/bridge/google-to-wx.js";
import type { GoogleMailEvent } from "../../src/google/event.js";
import {
  startMockHub,
  injectMessage,
  getMessages,
  resetMock,
  waitFor,
  MOCK_HUB_URL,
  MOCK_WEBHOOK_SECRET,
  MOCK_APP_TOKEN,
  MOCK_INSTALLATION_ID,
  MOCK_BOT_ID,
  APP_PORT,
} from "./setup.js";

// ─── Mock GoogleClient ───
// 模拟 Google 客户端，不连接真实 Google API，仅记录调用

/** 记录 sendEmail 调用 */
let googleSentEmails: Array<{
  to: string;
  subject: string;
  body: string;
  messageId: string;
}> = [];

/** 记录 replyEmail 调用 */
let googleReplyEmails: Array<{
  originalMsgId: string;
  body: string;
  messageId: string;
}> = [];

/** 消息 ID 计数器 */
let googleMsgIdCounter = 0;

/**
 * 创建 Mock GoogleClient
 * 实现 sendEmail / replyEmail / getEmail 方法，返回模拟数据
 */
function createMockGoogleClient() {
  return {
    sendEmail: async (
      to: string,
      subject: string,
      body: string,
    ): Promise<string> => {
      googleMsgIdCounter++;
      const messageId = `gmail_msg_${googleMsgIdCounter}`;
      googleSentEmails.push({ to, subject, body, messageId });
      return messageId;
    },
    replyEmail: async (
      originalMsgId: string,
      body: string,
    ): Promise<string> => {
      googleMsgIdCounter++;
      const messageId = `gmail_reply_${googleMsgIdCounter}`;
      googleReplyEmails.push({ originalMsgId, body, messageId });
      return messageId;
    },
    getEmail: async (messageId: string): Promise<any> => {
      // 返回模拟的邮件详情，包含 threadId
      return {
        id: messageId,
        threadId: `thread_${messageId}`,
        payload: {
          headers: [
            { name: "From", value: "test@example.com" },
            { name: "Subject", value: "Test Subject" },
          ],
        },
      };
    },
    listEmails: async (): Promise<any[]> => [],
  };
}

// ─── 测试主体 ───

describe("Google Workspace Bridge 集成测试", () => {
  let mockHubHandle: { server: http.Server; close: () => Promise<void> };
  let appServer: http.Server;
  let store: Store;
  let wxToGoogle: WxToGoogle;
  let googleToWx: GoogleToWx;
  const notifyEmail = "notify@example.com";

  beforeAll(async () => {
    // 1. 启动 Mock Hub Server
    mockHubHandle = await startMockHub();

    // 2. 初始化内存数据库和存储
    store = new Store(":memory:");

    // 3. 注入 installation 记录（模拟已完成 OAuth 安装）
    store.saveInstallation({
      id: MOCK_INSTALLATION_ID,
      hubUrl: MOCK_HUB_URL,
      appId: "test-app",
      botId: MOCK_BOT_ID,
      appToken: MOCK_APP_TOKEN,
      webhookSecret: MOCK_WEBHOOK_SECRET,
      createdAt: new Date().toISOString(),
    });

    // 4. 创建 Mock GoogleClient 和桥接模块
    const mockGoogle = createMockGoogleClient();
    wxToGoogle = new WxToGoogle(mockGoogle as any, store, notifyEmail);
    googleToWx = new GoogleToWx(store);

    // 5. 启动轻量 App HTTP 服务器（只处理 /hub/webhook）
    appServer = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${APP_PORT}`);

      if (req.method === "POST" && url.pathname === "/hub/webhook") {
        await handleWebhook(req, res, store, async (event, installationId) => {
          if (!event.event) return;

          const installation = store.getInstallation(installationId);
          if (!installation) return;

          // 微信->Google 桥接
          if (event.event.type === "message") {
            await wxToGoogle.handleWxEvent(event, installation);
          }
        });
        return;
      }

      // 健康检查
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve, reject) => {
      appServer.on("error", reject);
      appServer.listen(APP_PORT, () => {
        console.log(`[test] App Server 已启动，端口 ${APP_PORT}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    // 关闭 App 服务器
    await new Promise<void>((resolve) =>
      appServer.close(() => {
        console.log("[test] App Server 已关闭");
        resolve();
      }),
    );

    // 关闭 Mock Hub Server
    await mockHubHandle.close();

    // 关闭数据库
    store.close();
  });

  beforeEach(() => {
    // 每个测试前重置消息记录
    resetMock();
    googleSentEmails = [];
    googleReplyEmails = [];
    // 注意：不重置 googleMsgIdCounter，保证 message_id 在跨测试中唯一
  });

  // ─── 微信->Google 方向测试 ───

  it("Mock Hub Server 健康检查", async () => {
    const res = await fetch(`${MOCK_HUB_URL}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("App Server 健康检查", async () => {
    const res = await fetch(`http://localhost:${APP_PORT}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("微信文本消息应通过 Hub->App->Gmail 链路发送邮件通知", async () => {
    // Mock Hub 注入微信消息 -> 转发到 App webhook -> WxToGoogle 发送邮件
    await injectMessage("user_alice", "你好 Google");

    // 等待 WxToGoogle 处理完成（Gmail 端收到邮件）
    await waitFor(async () => googleSentEmails.length > 0, 5000);

    // 验证 Gmail 发送了邮件通知
    expect(googleSentEmails.length).toBe(1);
    expect(googleSentEmails[0].to).toBe(notifyEmail);
    expect(googleSentEmails[0].subject).toContain("user_alice");
    expect(googleSentEmails[0].body).toContain("你好 Google");
  });

  it("不同微信用户的消息应各自创建独立邮件", async () => {
    // 使用不同用户名，确保两条消息都走 sendEmail（新建邮件）
    await injectMessage("user_alpha", "第一条消息");
    await waitFor(async () => googleSentEmails.length >= 1, 5000);

    await injectMessage("user_beta", "第二条消息");
    await waitFor(async () => googleSentEmails.length >= 2, 5000);

    // 两条消息都应走 sendEmail，而非 replyEmail
    expect(googleSentEmails.length).toBe(2);
    expect(googleSentEmails[0].body).toContain("第一条消息");
    expect(googleSentEmails[1].body).toContain("第二条消息");
  });

  it("同一微信用户的后续消息应走 replyEmail 保持线程连续", async () => {
    // 第一条消息创建新邮件
    await injectMessage("user_charlie", "第一条");
    await waitFor(async () => googleSentEmails.length > 0, 5000);

    const firstMsgId = googleSentEmails[0].messageId;

    // 第二条消息应尝试回复同一线程
    await injectMessage("user_charlie", "第二条");
    await waitFor(
      async () =>
        googleSentEmails.length + googleReplyEmails.length >= 2,
      5000,
    );

    // 验证第二条走了 replyEmail
    expect(googleReplyEmails.length).toBe(1);
    expect(googleReplyEmails[0].originalMsgId).toBe(firstMsgId);
    expect(googleReplyEmails[0].body).toContain("第二条");
  });

  it("消息映射应正确保存到 Store", async () => {
    await injectMessage("user_dave", "测试映射");

    await waitFor(async () => googleSentEmails.length > 0, 5000);

    // 验证 Store 中保存了消息映射
    const link = store.getLatestLinkByWxUser(
      MOCK_INSTALLATION_ID,
      "user_dave",
    );
    expect(link).toBeDefined();
    expect(link!.wxUserId).toBe("user_dave");
    expect(link!.wxUserName).toBe("user_dave");
    expect(link!.installationId).toBe(MOCK_INSTALLATION_ID);
    // messageId 应该是 Mock GoogleClient 生成的
    expect(link!.googleMsgId).toMatch(/^gmail_msg_/);
  });

  // ─── Google->微信 方向测试 ───

  it("Gmail 新邮件应通过 GoogleToWx->HubClient 通知到微信", async () => {
    // 先模拟一条微信->Gmail 的消息，建立消息映射
    await injectMessage("user_eve", "你好，请回复我");
    await waitFor(async () => googleSentEmails.length > 0, 5000);

    // 获取映射中的 Gmail 消息 ID
    const link = store.getLatestLinkByWxUser(
      MOCK_INSTALLATION_ID,
      "user_eve",
    );
    expect(link).toBeDefined();

    // 模拟收到一封与该消息 ID 关联的新邮件
    const mailEvent: GoogleMailEvent = {
      messageId: link!.googleMsgId,
      threadId: link!.googleThreadId,
      from: "reply@example.com",
      subject: "Re: [微信] user_eve",
      body: "收到，已处理",
      date: new Date().toISOString(),
    };

    const installations = store.getAllInstallations();
    await googleToWx.handleNewMail(mailEvent, installations);

    // 等待 HubClient 将消息发送到 Mock Hub
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    // 验证 Mock Hub 收到了通知消息
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(1);
    expect(hubMessages[0].user_id).toBe("user_eve");
    expect(hubMessages[0].type).toBe("text");
    expect(hubMessages[0].text).toContain("收到，已处理");
  });

  it("无关联的 Gmail 邮件应被忽略", async () => {
    // 模拟一封没有关联记录的邮件
    const mailEvent: GoogleMailEvent = {
      messageId: "unknown_msg_id",
      threadId: "unknown_thread_id",
      from: "stranger@example.com",
      subject: "无关邮件",
      body: "这是一封无关邮件",
      date: new Date().toISOString(),
    };

    const installations = store.getAllInstallations();
    await googleToWx.handleNewMail(mailEvent, installations);

    // Mock Hub 不应收到任何消息
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(0);
  });

  // ─── Webhook 验证测试 ───

  it("无效签名的 webhook 请求应被拒绝（401）", async () => {
    const hubEvent = {
      v: "1",
      type: "event",
      trace_id: "tr_bad_sig",
      installation_id: MOCK_INSTALLATION_ID,
      bot: { id: MOCK_BOT_ID },
      event: {
        type: "message",
        id: "evt_bad",
        timestamp: new Date().toISOString(),
        data: {
          user_id: "hacker",
          user_name: "hacker",
          type: "text",
          text: "恶意消息",
        },
      },
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": "invalid_signature_here",
      },
      body: JSON.stringify(hubEvent),
    });

    // 应返回 401
    expect(res.status).toBe(401);

    // Gmail 端不应收到任何邮件
    expect(googleSentEmails.length).toBe(0);
  });

  it("缺少 installation_id 的请求应被拒绝（400）", async () => {
    const hubEvent = {
      v: "1",
      type: "event",
      trace_id: "tr_no_inst",
      // 没有 installation_id
      bot: { id: MOCK_BOT_ID },
      event: {
        type: "message",
        id: "evt_no_inst",
        timestamp: new Date().toISOString(),
        data: { user_id: "user", text: "test" },
      },
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": "whatever",
      },
      body: JSON.stringify(hubEvent),
    });

    expect(res.status).toBe(400);
  });

  it("url_verification 请求应正确返回 challenge", async () => {
    const verifyEvent = {
      v: "1",
      type: "url_verification",
      challenge: "test_challenge_token_123",
      installation_id: MOCK_INSTALLATION_ID,
      bot: { id: MOCK_BOT_ID },
    };

    const bodyStr = JSON.stringify(verifyEvent);
    const crypto = await import("node:crypto");
    const sig = crypto
      .createHmac("sha256", MOCK_WEBHOOK_SECRET)
      .update(bodyStr)
      .digest("hex");

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": sig,
      },
      body: bodyStr,
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ challenge: "test_challenge_token_123" });
  });

  // ─── 完整双向链路测试 ───

  it("完整双向链路：微信->Gmail->微信", async () => {
    // 步骤 1: 微信用户发消息 -> Hub -> App -> Gmail 邮件通知
    await injectMessage("user_frank", "你好，请帮我查个信息");

    await waitFor(async () => googleSentEmails.length > 0, 5000);

    // 验证 Gmail 端收到邮件
    expect(googleSentEmails.length).toBeGreaterThanOrEqual(1);
    const lastEmail = googleSentEmails[googleSentEmails.length - 1];
    expect(lastEmail.subject).toContain("user_frank");
    expect(lastEmail.body).toContain("你好，请帮我查个信息");

    // 步骤 2: 模拟 Gmail 收到回复 -> App -> Hub -> 微信
    const link = store.getLatestLinkByWxUser(
      MOCK_INSTALLATION_ID,
      "user_frank",
    );
    expect(link).toBeDefined();

    const replyEvent: GoogleMailEvent = {
      messageId: link!.googleMsgId,
      threadId: link!.googleThreadId,
      from: "helper@example.com",
      subject: "Re: [微信] user_frank",
      body: "查好了，结果如下...",
      date: new Date().toISOString(),
    };

    const installations = store.getAllInstallations();
    await googleToWx.handleNewMail(replyEvent, installations);

    // 验证 Mock Hub 收到了回复
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(1);
    expect(hubMessages[0].user_id).toBe("user_frank");
    expect(hubMessages[0].text).toContain("查好了，结果如下...");
  });
});
