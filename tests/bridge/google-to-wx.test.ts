/**
 * GoogleToWx 桥接模块测试
 * 验证新邮件通知推送到微信的逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleToWx } from "../../src/bridge/google-to-wx.js";
import type { Store } from "../../src/store.js";
import type { Installation } from "../../src/hub/types.js";
import type { GoogleMailEvent } from "../../src/google/event.js";

/** 创建模拟的 Store */
function mockStore(): Store {
  return {
    getInstallation: vi.fn(),
    getAllInstallations: vi.fn(() => []),
    saveInstallation: vi.fn(),
    saveMessageLink: vi.fn(),
    getMessageLinkByGoogleMsg: vi.fn(() => undefined),
    getLatestLinkByWxUser: vi.fn(() => undefined),
    close: vi.fn(),
  } as any;
}

const installation: Installation = {
  id: "inst-001",
  hubUrl: "https://hub.example.com",
  appId: "app-001",
  botId: "bot-001",
  appToken: "token-abc",
  webhookSecret: "secret-xyz",
};

const mailEvent: GoogleMailEvent = {
  messageId: "gmail-msg-001",
  threadId: "gmail-thread-001",
  from: "sender@example.com",
  subject: "测试邮件主题",
  body: "这是邮件正文内容",
  date: "2026-01-01T12:00:00Z",
};

describe("GoogleToWx", () => {
  let store: ReturnType<typeof mockStore>;
  let bridge: GoogleToWx;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    store = mockStore();
    bridge = new GoogleToWx(store);
    originalFetch = globalThis.fetch;
    // 模拟 fetch（HubClient 内部调用）
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(""),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("没有安装实例时应跳过通知", async () => {
    await bridge.handleNewMail(mailEvent, []);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("有消息关联记录时应通知对应微信用户", async () => {
    (store.getMessageLinkByGoogleMsg as any).mockReturnValue({
      installationId: "inst-001",
      googleMsgId: "gmail-msg-001",
      wxUserId: "wx-user-001",
      wxUserName: "张三",
    });

    await bridge.handleNewMail(mailEvent, [installation]);

    // 应通过 fetch 发送消息到 Hub
    expect(globalThis.fetch).toHaveBeenCalled();
    const [url, options] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain("/api/v1/bots/bot-001/messages");

    const body = JSON.parse(options.body);
    expect(body.user_id).toBe("wx-user-001");
    expect(body.type).toBe("text");
  });

  it("通知内容应包含邮件关键信息", async () => {
    (store.getMessageLinkByGoogleMsg as any).mockReturnValue({
      installationId: "inst-001",
      googleMsgId: "gmail-msg-001",
      wxUserId: "wx-user-001",
      wxUserName: "张三",
    });

    await bridge.handleNewMail(mailEvent, [installation]);

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    const text = body.text as string;
    expect(text).toContain("sender@example.com");
    expect(text).toContain("测试邮件主题");
    expect(text).toContain("新邮件通知");
  });

  it("无关联记录时不应发送通知", async () => {
    (store.getMessageLinkByGoogleMsg as any).mockReturnValue(undefined);

    await bridge.handleNewMail(mailEvent, [installation]);

    // fetch 不应被调用（无关联用户）
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("邮件正文过长时应截断为摘要", async () => {
    (store.getMessageLinkByGoogleMsg as any).mockReturnValue({
      installationId: "inst-001",
      googleMsgId: "gmail-msg-001",
      wxUserId: "wx-user-001",
      wxUserName: "张三",
    });

    const longBodyEvent: GoogleMailEvent = {
      ...mailEvent,
      body: "a".repeat(500),
    };

    await bridge.handleNewMail(longBodyEvent, [installation]);

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    const text = body.text as string;
    // 应包含省略号
    expect(text).toContain("...");
    // 总长度应小于原文
    expect(text.length).toBeLessThan(500);
  });

  it("关联记录的 installationId 不匹配时不应发送", async () => {
    (store.getMessageLinkByGoogleMsg as any).mockReturnValue({
      installationId: "inst-other",
      googleMsgId: "gmail-msg-001",
      wxUserId: "wx-user-001",
      wxUserName: "张三",
    });

    await bridge.handleNewMail(mailEvent, [installation]);

    // installationId 不匹配，不应发送
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
