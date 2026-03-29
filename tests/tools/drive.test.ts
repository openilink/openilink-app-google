/**
 * Drive 工具模块测试
 * 验证 list/search 等文件管理工具
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { driveTools } from "../../src/tools/drive.js";
import type { GoogleClient } from "../../src/google/client.js";
import type { ToolContext } from "../../src/hub/types.js";

/** 创建模拟的 GoogleClient */
function mockGoogleClient(): GoogleClient {
  return {
    sendEmail: vi.fn().mockResolvedValue("msg-001"),
    listEmails: vi.fn().mockResolvedValue([]),
    getEmail: vi.fn().mockResolvedValue({}),
    replyEmail: vi.fn().mockResolvedValue("msg-002"),
    listEvents: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({}),
    deleteEvent: vi.fn(),
    getFreeBusy: vi.fn().mockResolvedValue({}),
    listFiles: vi.fn().mockResolvedValue([
      {
        id: "file-001",
        name: "项目文档.docx",
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: "2026-01-01T00:00:00Z",
      },
      {
        id: "file-002",
        name: "数据表格.xlsx",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-01-02T00:00:00Z",
      },
    ]),
    searchFiles: vi.fn().mockResolvedValue([
      {
        id: "file-001",
        name: "项目文档.docx",
        mimeType: "application/vnd.google-apps.document",
      },
    ]),
    createFolder: vi.fn().mockResolvedValue("folder-new-001"),
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

describe("Drive 工具", () => {
  let client: ReturnType<typeof mockGoogleClient>;
  let handlers: Map<string, any>;

  beforeEach(() => {
    client = mockGoogleClient();
    handlers = driveTools.createHandlers(client);
  });

  describe("工具定义", () => {
    it("应包含 3 个工具定义", () => {
      expect(driveTools.definitions).toHaveLength(3);
    });

    it("应包含 list_files 工具", () => {
      const tool = driveTools.definitions.find((t) => t.name === "list_files");
      expect(tool).toBeDefined();
    });

    it("应包含 search_files 工具", () => {
      const tool = driveTools.definitions.find((t) => t.name === "search_files");
      expect(tool).toBeDefined();
      expect(tool!.parameters).toHaveProperty("name");
    });

    it("应包含 create_folder 工具", () => {
      const tool = driveTools.definitions.find((t) => t.name === "create_folder");
      expect(tool).toBeDefined();
    });
  });

  describe("list_files 处理器", () => {
    it("应返回文件列表", async () => {
      const handler = handlers.get("list_files")!;
      const result = await handler(makeCtx({}));

      expect(client.listFiles).toHaveBeenCalled();
      expect(result).toContain("2");
      expect(result).toContain("文件");
    });

    it("无文件时应返回提示", async () => {
      (client.listFiles as any).mockResolvedValueOnce([]);

      const handler = handlers.get("list_files")!;
      const result = await handler(makeCtx({}));

      expect(result).toContain("没有找到");
    });

    it("应支持传入查询和数量参数", async () => {
      const handler = handlers.get("list_files")!;
      await handler(makeCtx({ query: "mimeType='application/pdf'", count: 5 }));

      expect(client.listFiles).toHaveBeenCalledWith(
        "mimeType='application/pdf'",
        5,
      );
    });

    it("API 失败时应返回错误消息", async () => {
      (client.listFiles as any).mockRejectedValueOnce(
        new Error("Drive API 限流"),
      );

      const handler = handlers.get("list_files")!;
      const result = await handler(makeCtx({}));

      expect(result).toContain("失败");
      expect(result).toContain("Drive API 限流");
    });
  });

  describe("search_files 处理器", () => {
    it("应按名称搜索文件", async () => {
      const handler = handlers.get("search_files")!;
      const result = await handler(makeCtx({ name: "项目文档" }));

      expect(client.searchFiles).toHaveBeenCalledWith("项目文档");
      expect(result).toContain("搜索到");
      expect(result).toContain("1");
    });

    it("搜索无结果时应返回提示", async () => {
      (client.searchFiles as any).mockResolvedValueOnce([]);

      const handler = handlers.get("search_files")!;
      const result = await handler(makeCtx({ name: "不存在的文件" }));

      expect(result).toContain("没有找到");
    });
  });

  describe("create_folder 处理器", () => {
    it("应创建文件夹并返回 ID", async () => {
      const handler = handlers.get("create_folder")!;
      const result = await handler(makeCtx({ name: "新文件夹" }));

      expect(client.createFolder).toHaveBeenCalledWith("新文件夹", undefined);
      expect(result).toContain("成功");
      expect(result).toContain("folder-new-001");
    });

    it("应支持指定父文件夹", async () => {
      const handler = handlers.get("create_folder")!;
      await handler(
        makeCtx({ name: "子文件夹", parent_id: "parent-001" }),
      );

      expect(client.createFolder).toHaveBeenCalledWith(
        "子文件夹",
        "parent-001",
      );
    });

    it("创建失败时应返回错误消息", async () => {
      (client.createFolder as any).mockRejectedValueOnce(
        new Error("存储空间不足"),
      );

      const handler = handlers.get("create_folder")!;
      const result = await handler(makeCtx({ name: "新文件夹" }));

      expect(result).toContain("失败");
    });
  });
});
