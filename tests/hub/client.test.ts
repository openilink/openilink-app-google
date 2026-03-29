/**
 * HubClient 模块测试
 * 验证消息发送、错误处理逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HubClient } from "../../src/hub/client.js";

describe("HubClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("应正确初始化并去除尾部斜杠", () => {
    const client = new HubClient("https://hub.example.com/", "token-123");
    // 验证实例创建成功
    expect(client).toBeDefined();
  });

  it("sendText 应发送正确格式的请求", async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ ok: true, message_id: "msg-001" }),
      text: () => Promise.resolve(""),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new HubClient("https://hub.example.com", "token-123");
    const result = await client.sendText("bot-001", "user-001", "hello");

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    const [url, options] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe("https://hub.example.com/api/v1/bots/bot-001/messages");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer token-123");

    const body = JSON.parse(options.body);
    expect(body.user_id).toBe("user-001");
    expect(body.type).toBe("text");
    expect(body.text).toBe("hello");
  });

  it("sendImage 应包含 image_url 字段", async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(""),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new HubClient("https://hub.example.com", "token-123");
    await client.sendImage("bot-001", "user-001", "https://img.example.com/1.jpg");

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.type).toBe("image");
    expect(body.image_url).toBe("https://img.example.com/1.jpg");
  });

  it("sendFile 应包含 file_url 和 file_name 字段", async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(""),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new HubClient("https://hub.example.com", "token-123");
    await client.sendFile("bot-001", "user-001", "https://example.com/file.pdf", "doc.pdf");

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.type).toBe("file");
    expect(body.file_url).toBe("https://example.com/file.pdf");
    expect(body.file_name).toBe("doc.pdf");
  });

  it("HTTP 错误应返回 ok: false", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new HubClient("https://hub.example.com", "token-123");
    const result = await client.sendText("bot-001", "user-001", "hello");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("网络异常应返回 ok: false", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("网络连接失败"));

    const client = new HubClient("https://hub.example.com", "token-123");
    const result = await client.sendText("bot-001", "user-001", "hello");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("网络连接失败");
  });
});
