/**
 * Hub OAuth 流程处理
 * 实现 OAuth PKCE 授权与回调，完成应用安装
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import { HubClient } from "./client.js";

/** 临时存储 PKCE state -> code_verifier 的映射 */
const pendingStates = new Map<
  string,
  { codeVerifier: string; expiresAt: number }
>();

/** 定期清理过期的 PKCE state（5 分钟过期） */
function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [key, value] of pendingStates) {
    if (value.expiresAt < now) {
      pendingStates.delete(key);
    }
  }
}

/**
 * 处理 OAuth 安装请求（/oauth/setup）
 * 生成 PKCE 参数并重定向到 Hub 授权页面
 */
export function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): void {
  // 清理过期 state
  cleanExpiredStates();

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const hubUrl = url.searchParams.get("hub_url") ?? config.hubUrl;

  // 生成 PKCE 参数
  const { codeVerifier, codeChallenge } = generatePKCE();

  // 生成随机 state 防止 CSRF
  const state = crypto.randomUUID();
  pendingStates.set(state, {
    codeVerifier,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 分钟有效
  });

  // 构造 Hub 授权 URL
  const redirectUri = `${config.baseUrl}/oauth/callback`;
  const authUrl = new URL(`${hubUrl}/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // 重定向到 Hub 授权页面
  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}

/**
 * 处理 OAuth 回调（/oauth/callback）
 * 使用授权码 + code_verifier 换取安装信息并持久化
 */
export async function handleOAuthRedirect(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  store: Store,
  tools?: Record<string, unknown>[],
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // 校验参数完整性
  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 code 或 state 参数" }));
    return;
  }

  // 验证 state 并取出 code_verifier
  const pending = pendingStates.get(state);
  if (!pending) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或已过期的 state" }));
    return;
  }
  pendingStates.delete(state);

  // 检查是否过期
  if (pending.expiresAt < Date.now()) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "state 已过期，请重新授权" }));
    return;
  }

  try {
    // 使用授权码换取安装令牌
    const tokenUrl = `${config.hubUrl}/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${config.baseUrl}/oauth/callback`,
        code_verifier: pending.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("[OAuth] 换取令牌失败:", tokenRes.status, errorText);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "换取令牌失败" }));
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      installation_id: string;
      app_id: string;
      bot_id: string;
      app_token: string;
      webhook_secret: string;
    };

    // 保存安装信息到数据库
    store.saveInstallation({
      id: tokenData.installation_id,
      hubUrl: config.hubUrl,
      appId: tokenData.app_id,
      botId: tokenData.bot_id,
      appToken: tokenData.app_token,
      webhookSecret: tokenData.webhook_secret,
      createdAt: new Date().toISOString(),
    });

    console.log(
      `[OAuth] 安装成功: installation_id=${tokenData.installation_id}`,
    );

    // OAuth 完成后同步工具定义到 Hub
    if (tools && tools.length > 0) {
      const hubClient = new HubClient(config.hubUrl, tokenData.app_token);
      await hubClient.syncTools(tools).catch((err) => {
        console.error("[OAuth] 同步工具失败:", err);
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        message: "安装成功",
        installation_id: tokenData.installation_id,
      }),
    );
  } catch (err) {
    console.error("[OAuth] 回调处理异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部服务器错误" }));
  }
}
