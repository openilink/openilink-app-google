/**
 * WxToGoogle 桥接模块测试
 * 验证微信消息转邮件通知的格式和逻辑
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WxToGoogle } from "../../src/bridge/wx-to-google.js";
import type { GoogleClient } from "../../src/google/client.js";
import type { Store } from "../../src/store.js";
import type { HubEvent, Installation } from "../../src/hub/types.js";

/** 创建模拟的 GoogleClient */
function mockGoogleClient(): GoogleClient {
  return {
    sendEmail: vi.fn().mockResolvedValue("gmail-msg-001"),
    replyEmail: vi.fn().mockResolvedValue("gmail-msg-002"),
    getEmail: vi.fn().mockResolvedValue({
      id: "gmail-msg-001",
      threadId: "gmail-thread-001",
    }),
    listEmails: vi.fn().mockResolvedValue([]),
    listEvents: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({}),
    deleteEvent: vi.fn(),
    getFreeBusy: vi.fn().mockResolvedValue({}),
    listFiles: vi.fn().mockResolvedValue([]),
    searchFiles: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn().mockResolvedValue("folder-001"),
    createDoc: vi.fn().mockResolvedValue({ docId: "doc-001", url: "" }),
    getDoc: vi.fn().mockResolvedValue({}),
    readSheet: vi.fn().mockResolvedValue([]),
    writeSheet: vi.fn(),
    appendSheet: vi.fn(),
  } as any;
}

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

/** 构建测试用的 HubEvent */
function makeEvent(overrides?: Partial<HubEvent["event"]>): HubEvent {
  return {
    v: "1",
    type: "event",
    trace_id: "trace-001",
    installation_id: "inst-001",
    bot: { id: "bot-001" },
    event: {
      type: "message",
      id: "evt-001",
      timestamp: "2026-01-01T00:00:00Z",
      data: {
        user_id: "wx-user-001",
        user_name: "张三",
        type: "text",
        text: "你好，这是一条测试消息",
      },
      ...overrides,
    },
  };
}

const installation: Installation = {
  id: "inst-001",
  hubUrl: "https://hub.example.com",
  appId: "app-001",
  botId: "bot-001",
  appToken: "token-abc",
  webhookSecret: "secret-xyz",
};

describe("WxToGoogle", () => {
  let googleClient: ReturnType<typeof mockGoogleClient>;
  let store: ReturnType<typeof mockStore>;
  let bridge: WxToGoogle;

  beforeEach(() => {
    googleClient = mockGoogleClient();
    store = mockStore();
    bridge = new WxToGoogle(googleClient, store, "test@gmail.com");
  });

  it("应将文本消息转发为邮件", async () => {
    const event = makeEvent();
    await bridge.handleWxEvent(event, installation);

    expect(googleClient.sendEmail).toHaveBeenCalledOnce();
    const [to, subject, body] = (googleClient.sendEmail as any).mock.calls[0];
    expect(to).toBe("test@gmail.com");
    expect(subject).toContain("[微信]");
    expect(subject).toContain("张三");
    expect(body).toContain("你好，这是一条测试消息");
  });

  it("邮件主题应包含发送人姓名", async () => {
    const event = makeEvent();
    await bridge.handleWxEvent(event, installation);

    const [, subject] = (googleClient.sendEmail as any).mock.calls[0];
    expect(subject).toBe("[微信] 张三");
  });

  it("应保存消息关联记录", async () => {
    const event = makeEvent();
    await bridge.handleWxEvent(event, installation);

    expect(store.saveMessageLink).toHaveBeenCalledOnce();
    const linkArg = (store.saveMessageLink as any).mock.calls[0][0];
    expect(linkArg.installationId).toBe("inst-001");
    expect(linkArg.wxUserId).toBe("wx-user-001");
    expect(linkArg.wxUserName).toBe("张三");
    expect(linkArg.googleMsgId).toBeDefined();
  });

  it("有历史线程时应回复邮件", async () => {
    (store.getLatestLinkByWxUser as any).mockReturnValue({
      googleMsgId: "prev-msg",
      googleThreadId: "prev-thread",
    });

    const event = makeEvent();
    await bridge.handleWxEvent(event, installation);

    expect(googleClient.replyEmail).toHaveBeenCalledOnce();
  });

  it("回复失败时应降级为新建邮件", async () => {
    (store.getLatestLinkByWxUser as any).mockReturnValue({
      googleMsgId: "prev-msg",
      googleThreadId: "prev-thread",
    });
    (googleClient.replyEmail as any).mockRejectedValueOnce(new Error("回复失败"));

    const event = makeEvent();
    await bridge.handleWxEvent(event, installation);

    // 回复失败后应调用 sendEmail
    expect(googleClient.sendEmail).toHaveBeenCalledOnce();
  });

  it("图片消息应生成描述性邮件", async () => {
    const event = makeEvent({
      data: {
        user_id: "wx-user-001",
        user_name: "张三",
        type: "image",
        image_url: "https://example.com/photo.jpg",
      },
    });
    await bridge.handleWxEvent(event, installation);

    const [, subject] = (googleClient.sendEmail as any).mock.calls[0];
    expect(subject).toContain("图片");
  });

  it("command 事件应被跳过（由工具系统处理）", async () => {
    const event = makeEvent({ type: "command" });
    await bridge.handleWxEvent(event, installation);

    expect(googleClient.sendEmail).not.toHaveBeenCalled();
  });

  it("未配置 notifyEmail 时不应发送邮件", async () => {
    const bridgeNoEmail = new WxToGoogle(googleClient, store);
    const event = makeEvent();
    await bridgeNoEmail.handleWxEvent(event, installation);

    expect(googleClient.sendEmail).not.toHaveBeenCalled();
  });
});
