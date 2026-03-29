/**
 * Gmail 工具模块测试
 * 验证 send/list/search 等工具的调用逻辑
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { gmailTools } from "../../src/tools/gmail.js";
import type { GoogleClient } from "../../src/google/client.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 GoogleClient */
function mockGoogleClient(): GoogleClient {
  return {
    sendEmail: vi.fn().mockResolvedValue("gmail-msg-001"),
    listEmails: vi.fn().mockResolvedValue([
      { id: "msg-001", threadId: "thread-001" },
      { id: "msg-002", threadId: "thread-002" },
    ]),
    getEmail: vi.fn().mockResolvedValue({
      id: "msg-001",
      snippet: "邮件摘要",
      payload: { headers: [{ name: "Subject", value: "测试邮件" }] },
    }),
    replyEmail: vi.fn().mockResolvedValue("gmail-reply-001"),
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

/** 创建工具调用上下文 */
function makeCtx(args: Record<string, any>): ToolContext {
  return {
    installationId: "inst-001",
    botId: "bot-001",
    userId: "user-001",
    traceId: "trace-001",
    args,
  };
}

describe("Gmail 工具", () => {
  let client: ReturnType<typeof mockGoogleClient>;
  let handlers: Map<string, any>;

  beforeEach(() => {
    client = mockGoogleClient();
    handlers = gmailTools.createHandlers(client);
  });

  describe("工具定义", () => {
    it("应包含 5 个工具定义", () => {
      expect(gmailTools.definitions).toHaveLength(5);
    });

    it("应包含 send_email 工具", () => {
      const tool = gmailTools.definitions.find((t) => t.name === "send_email");
      expect(tool).toBeDefined();
      expect(tool!.parameters).toHaveProperty("to");
      expect(tool!.parameters).toHaveProperty("subject");
      expect(tool!.parameters).toHaveProperty("body");
    });

    it("应包含 list_emails 工具", () => {
      const tool = gmailTools.definitions.find((t) => t.name === "list_emails");
      expect(tool).toBeDefined();
    });

    it("应包含 search_emails 工具", () => {
      const tool = gmailTools.definitions.find((t) => t.name === "search_emails");
      expect(tool).toBeDefined();
    });
  });

  describe("send_email 处理器", () => {
    it("应调用 client.sendEmail 并返回成功消息", async () => {
      const handler = handlers.get("send_email")!;
      const result = await handler(
        makeCtx({ to: "test@example.com", subject: "测试", body: "内容" }),
      );

      expect(client.sendEmail).toHaveBeenCalledWith(
        "test@example.com",
        "测试",
        "内容",
        undefined,
      );
      expect(result).toContain("成功");
      expect(result).toContain("gmail-msg-001");
    });

    it("发送失败时应返回错误消息", async () => {
      (client.sendEmail as any).mockRejectedValueOnce(new Error("API 配额超限"));

      const handler = handlers.get("send_email")!;
      const result = await handler(
        makeCtx({ to: "test@example.com", subject: "测试", body: "内容" }),
      );

      expect(result).toContain("失败");
      expect(result).toContain("API 配额超限");
    });
  });

  describe("list_emails 处理器", () => {
    it("应调用 client.listEmails 并返回结果", async () => {
      const handler = handlers.get("list_emails")!;
      const result = await handler(makeCtx({ query: "is:unread", count: 5 }));

      expect(client.listEmails).toHaveBeenCalledWith("is:unread", 5);
      expect(result).toContain("2");
    });

    it("没有匹配邮件时应返回提示", async () => {
      (client.listEmails as any).mockResolvedValueOnce([]);

      const handler = handlers.get("list_emails")!;
      const result = await handler(makeCtx({}));

      expect(result).toContain("没有找到");
    });

    it("默认返回 10 封邮件", async () => {
      const handler = handlers.get("list_emails")!;
      await handler(makeCtx({}));

      expect(client.listEmails).toHaveBeenCalledWith(undefined, 10);
    });
  });

  describe("search_emails 处理器", () => {
    it("应使用搜索关键词调用 listEmails", async () => {
      const handler = handlers.get("search_emails")!;
      const result = await handler(makeCtx({ query: "from:test@example.com" }));

      expect(client.listEmails).toHaveBeenCalledWith("from:test@example.com", 10);
      expect(result).toContain("搜索到");
    });

    it("搜索无结果时应返回提示", async () => {
      (client.listEmails as any).mockResolvedValueOnce([]);

      const handler = handlers.get("search_emails")!;
      const result = await handler(makeCtx({ query: "nonexistent" }));

      expect(result).toContain("没有找到");
    });
  });
});
