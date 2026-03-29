/**
 * Calendar 工具模块测试
 * 验证 list/create 等日程管理工具
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { calendarTools } from "../../src/tools/calendar.js";
import type { GoogleClient } from "../../src/google/client.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 GoogleClient */
function mockGoogleClient(): GoogleClient {
  return {
    sendEmail: vi.fn().mockResolvedValue("msg-001"),
    listEmails: vi.fn().mockResolvedValue([]),
    getEmail: vi.fn().mockResolvedValue({}),
    replyEmail: vi.fn().mockResolvedValue("msg-002"),
    listEvents: vi.fn().mockResolvedValue([
      {
        id: "event-001",
        summary: "团队周会",
        start: { dateTime: "2026-01-01T10:00:00+08:00" },
        end: { dateTime: "2026-01-01T11:00:00+08:00" },
      },
    ]),
    createEvent: vi.fn().mockResolvedValue({
      id: "event-new",
      summary: "新建事件",
    }),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    getFreeBusy: vi.fn().mockResolvedValue({
      calendars: {
        "user@example.com": { busy: [] },
      },
    }),
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

describe("Calendar 工具", () => {
  let client: ReturnType<typeof mockGoogleClient>;
  let handlers: Map<string, any>;

  beforeEach(() => {
    client = mockGoogleClient();
    handlers = calendarTools.createHandlers(client);
  });

  describe("工具定义", () => {
    it("应包含 4 个工具定义", () => {
      expect(calendarTools.definitions).toHaveLength(4);
    });

    it("应包含 list_events 工具", () => {
      const tool = calendarTools.definitions.find((t) => t.name === "list_events");
      expect(tool).toBeDefined();
    });

    it("应包含 create_event 工具", () => {
      const tool = calendarTools.definitions.find((t) => t.name === "create_event");
      expect(tool).toBeDefined();
      expect(tool!.parameters).toHaveProperty("summary");
      expect(tool!.parameters).toHaveProperty("start_time");
      expect(tool!.parameters).toHaveProperty("end_time");
    });

    it("应包含 delete_event 工具", () => {
      const tool = calendarTools.definitions.find((t) => t.name === "delete_event");
      expect(tool).toBeDefined();
    });

    it("应包含 get_free_busy 工具", () => {
      const tool = calendarTools.definitions.find((t) => t.name === "get_free_busy");
      expect(tool).toBeDefined();
    });
  });

  describe("list_events 处理器", () => {
    it("应返回日程列表", async () => {
      const handler = handlers.get("list_events")!;
      const result = await handler(makeCtx({}));

      expect(client.listEvents).toHaveBeenCalled();
      expect(result).toContain("1");
      expect(result).toContain("日程");
    });

    it("无日程时应返回提示", async () => {
      (client.listEvents as any).mockResolvedValueOnce([]);

      const handler = handlers.get("list_events")!;
      const result = await handler(makeCtx({}));

      expect(result).toContain("没有日程");
    });

    it("API 失败时应返回错误消息", async () => {
      (client.listEvents as any).mockRejectedValueOnce(
        new Error("Calendar API 不可用"),
      );

      const handler = handlers.get("list_events")!;
      const result = await handler(makeCtx({}));

      expect(result).toContain("失败");
    });
  });

  describe("create_event 处理器", () => {
    it("应创建日程并返回成功消息", async () => {
      const handler = handlers.get("create_event")!;
      const result = await handler(
        makeCtx({
          summary: "新会议",
          start_time: "2026-03-01T10:00:00+08:00",
          end_time: "2026-03-01T11:00:00+08:00",
        }),
      );

      expect(client.createEvent).toHaveBeenCalledWith(
        "新会议",
        "2026-03-01T10:00:00+08:00",
        "2026-03-01T11:00:00+08:00",
        undefined,
        undefined,
      );
      expect(result).toContain("成功");
    });

    it("应正确解析参与者邮箱列表", async () => {
      const handler = handlers.get("create_event")!;
      await handler(
        makeCtx({
          summary: "多人会议",
          start_time: "2026-03-01T10:00:00+08:00",
          end_time: "2026-03-01T11:00:00+08:00",
          attendees: "a@example.com, b@example.com",
        }),
      );

      expect(client.createEvent).toHaveBeenCalledWith(
        "多人会议",
        "2026-03-01T10:00:00+08:00",
        "2026-03-01T11:00:00+08:00",
        undefined,
        ["a@example.com", "b@example.com"],
      );
    });

    it("创建失败时应返回错误消息", async () => {
      (client.createEvent as any).mockRejectedValueOnce(
        new Error("权限不足"),
      );

      const handler = handlers.get("create_event")!;
      const result = await handler(
        makeCtx({
          summary: "新会议",
          start_time: "2026-03-01T10:00:00+08:00",
          end_time: "2026-03-01T11:00:00+08:00",
        }),
      );

      expect(result).toContain("失败");
      expect(result).toContain("权限不足");
    });
  });
});
