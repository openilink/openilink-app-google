/**
 * Router 模块测试
 * 验证路由注册、匹配和分发逻辑
 */

import { describe, it, expect, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { Router } from "../src/router.js";

/** 创建模拟的 IncomingMessage */
function mockReq(method: string, url: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:8086" };
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

describe("Router", () => {
  it("应支持注册和匹配 GET 路由", async () => {
    const router = new Router();
    const handler = vi.fn((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    router.get("/healthz", handler);

    const req = mockReq("GET", "/healthz");
    const res = mockRes();
    await router.handle(req, res);

    expect(handler).toHaveBeenCalledOnce();
    expect(res._status).toBe(200);
  });

  it("应支持注册和匹配 POST 路由", async () => {
    const router = new Router();
    const handler = vi.fn((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    router.post("/webhook", handler);

    const req = mockReq("POST", "/webhook");
    const res = mockRes();
    await router.handle(req, res);

    expect(handler).toHaveBeenCalledOnce();
  });

  it("未匹配的路径应返回 404", async () => {
    const router = new Router();
    router.get("/healthz", vi.fn());

    const req = mockReq("GET", "/unknown");
    const res = mockRes();
    await router.handle(req, res);

    expect(res._status).toBe(404);
  });

  it("HTTP 方法不匹配时应返回 404", async () => {
    const router = new Router();
    router.get("/healthz", vi.fn());

    const req = mockReq("POST", "/healthz");
    const res = mockRes();
    await router.handle(req, res);

    expect(res._status).toBe(404);
  });

  it("处理函数抛出异常应返回 500", async () => {
    const router = new Router();
    router.get("/error", () => {
      throw new Error("模拟异常");
    });

    const req = mockReq("GET", "/error");
    const res = mockRes();
    await router.handle(req, res);

    expect(res._status).toBe(500);
  });

  it("应正确统计路由数量", () => {
    const router = new Router();
    expect(router.routeCount).toBe(0);

    router.get("/a", vi.fn());
    router.post("/b", vi.fn());
    router.add("PUT", "/c", vi.fn());

    expect(router.routeCount).toBe(3);
  });

  it("add 方法应支持任意 HTTP 方法", async () => {
    const router = new Router();
    const handler = vi.fn((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    router.add("PUT", "/resource", handler);

    const req = mockReq("PUT", "/resource");
    const res = mockRes();
    await router.handle(req, res);

    expect(handler).toHaveBeenCalledOnce();
  });

  it("应支持注册多个路由并精确匹配", async () => {
    const router = new Router();
    const handler1 = vi.fn((_req, res) => {
      res.writeHead(200);
      res.end("route1");
    });
    const handler2 = vi.fn((_req, res) => {
      res.writeHead(200);
      res.end("route2");
    });

    router.get("/route1", handler1);
    router.get("/route2", handler2);

    const req = mockReq("GET", "/route2");
    const res = mockRes();
    await router.handle(req, res);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it("异步处理函数抛出异常应返回 500", async () => {
    const router = new Router();
    router.get("/async-error", async () => {
      throw new Error("异步异常");
    });

    const req = mockReq("GET", "/async-error");
    const res = mockRes();
    await router.handle(req, res);

    expect(res._status).toBe(500);
  });
});
