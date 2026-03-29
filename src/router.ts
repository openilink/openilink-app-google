/**
 * HTTP 路由器
 * 基于 Node.js 原生 http 模块，提供简洁的路由注册与请求分发
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** 路由处理函数类型 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

/** 单条路由规则 */
interface Route {
  /** HTTP 方法（大写） */
  method: string;
  /** 路径前缀或精确路径 */
  path: string;
  /** 处理函数 */
  handler: RouteHandler;
}

/**
 * 简易 HTTP 路由器
 * 支持按 method + path 精确匹配，未命中时返回 404
 */
export class Router {
  private routes: Route[] = [];

  /** 注册 GET 路由 */
  get(path: string, handler: RouteHandler): void {
    this.routes.push({ method: "GET", path, handler });
  }

  /** 注册 POST 路由 */
  post(path: string, handler: RouteHandler): void {
    this.routes.push({ method: "POST", path, handler });
  }

  /** 注册任意方法的路由 */
  add(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({ method: method.toUpperCase(), path, handler });
  }

  /**
   * 请求分发入口
   * 遍历路由表进行匹配，命中则执行处理函数，否则返回 404
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    for (const route of this.routes) {
      if (route.method === method && route.path === pathname) {
        try {
          await route.handler(req, res);
        } catch (err) {
          console.error(`[Router] 处理请求异常: ${method} ${pathname}`, err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "内部服务器错误" }));
          }
        }
        return;
      }
    }

    // 未匹配到任何路由
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }

  /** 获取已注册的路由数量（用于测试） */
  get routeCount(): number {
    return this.routes.length;
  }
}
