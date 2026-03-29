/**
 * Webhook 模块测试
 * 验证请求体解析、签名校验、事件分发
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { handleWebhook, readBody, type EventHandler } from "../../src/hub/webhook.js";
import type { Store } from "../../src/store.js";

/** 生成 HMAC-SHA256 签名 */
function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** 创建模拟的 IncomingMessage */
function mockReq(body: string, headers: Record<string, string> = {}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = "POST";
  req.headers = { ...headers };

  // 模拟请求体流
  process.nextTick(() => {
    req.push(Buffer.from(body));
    req.push(null);
  });

  return req;
}

/** 创建模拟的 ServerResponse */
function mockRes(): ServerResponse & { _status: number; _body: string } {
  const socket = new Socket();
  const res = new ServerResponse(
    new IncomingMessage(socket),
  ) as ServerResponse & { _status: number; _body: string };
  res._status = 200;
  res._body = "";

  res.writeHead = vi.fn((statusCode: number) => {
    res._status = statusCode;
    return res;
  }) as any;
  res.end = vi.fn((data?: string) => {
    res._body = data ?? "";
    return res;
  }) as any;

  return res;
}

/** 创建模拟的 Store */
function mockStore(installation?: any): Store {
  return {
    getInstallation: vi.fn(() => installation),
    getAllInstallations: vi.fn(() => (installation ? [installation] : [])),
    saveInstallation: vi.fn(),
    saveMessageLink: vi.fn(),
    getMessageLinkByGoogleMsg: vi.fn(() => undefined),
    getLatestLinkByWxUser: vi.fn(() => undefined),
    close: vi.fn(),
  } as any;
}

describe("readBody", () => {
  it("应正确读取请求体", async () => {
    const req = mockReq("hello world");
    const body = await readBody(req);
    expect(body.toString()).toBe("hello world");
  });
});

describe("handleWebhook", () => {
  const webhookSecret = "test-secret";
  const installation = {
    id: "inst-001",
    hubUrl: "https://hub.example.com",
    appId: "app-001",
    botId: "bot-001",
    appToken: "token-abc",
    webhookSecret,
  };

  it("无效 JSON 应返回 400", async () => {
    const req = mockReq("not-json");
    const res = mockRes();
    const store = mockStore(installation);
    const onEvent = vi.fn();

    await handleWebhook(req, res, store, onEvent);
    expect(res._status).toBe(400);
  });

  it("缺少 installation_id 应返回 400", async () => {
    const body = JSON.stringify({ type: "event" });
    const req = mockReq(body);
    const res = mockRes();
    const store = mockStore(installation);
    const onEvent = vi.fn();

    await handleWebhook(req, res, store, onEvent);
    expect(res._status).toBe(400);
  });

  it("未找到安装信息应返回 404", async () => {
    const body = JSON.stringify({ installation_id: "nonexistent" });
    const req = mockReq(body);
    const res = mockRes();
    const store = mockStore(undefined);
    const onEvent = vi.fn();

    await handleWebhook(req, res, store, onEvent);
    expect(res._status).toBe(404);
  });

  it("签名验证失败应返回 401", async () => {
    const body = JSON.stringify({
      installation_id: "inst-001",
      type: "event",
    });
    const req = mockReq(body, {
      "x-webhook-signature": "invalid-sig",
    });
    const res = mockRes();
    const store = mockStore(installation);
    const onEvent = vi.fn();

    await handleWebhook(req, res, store, onEvent);
    expect(res._status).toBe(401);
  });

  it("url_verification 应返回 challenge", async () => {
    const body = JSON.stringify({
      installation_id: "inst-001",
      type: "url_verification",
      challenge: "test-challenge",
    });
    const sig = sign(body, webhookSecret);
    const req = mockReq(body, { "x-webhook-signature": sig });
    const res = mockRes();
    const store = mockStore(installation);
    const onEvent = vi.fn();

    await handleWebhook(req, res, store, onEvent);
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ challenge: "test-challenge" });
  });

  it("合法事件应调用 onEvent 并返回 200", async () => {
    const body = JSON.stringify({
      v: "1",
      type: "event",
      trace_id: "trace-001",
      installation_id: "inst-001",
      bot: { id: "bot-001" },
      event: {
        type: "message",
        id: "evt-001",
        timestamp: "2026-01-01T00:00:00Z",
        data: { user_id: "user-001", text: "hello" },
      },
    });
    const sig = sign(body, webhookSecret);
    const req = mockReq(body, { "x-webhook-signature": sig });
    const res = mockRes();
    const store = mockStore(installation);
    const onEvent = vi.fn();

    await handleWebhook(req, res, store, onEvent);
    expect(res._status).toBe(200);
    expect(onEvent).toHaveBeenCalledOnce();
  });
});
