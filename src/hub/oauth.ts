/**
 * OAuth2 + PKCE 安装流程（含 setup 配置页）
 *
 * 1. Hub 访问 GET /oauth/setup → 显示 Google 配置表单
 * 2. 用户填写后 POST /oauth/setup → 生成 PKCE，重定向到 Hub 授权页
 * 3. Hub 授权完成后回调 GET /oauth/callback → 用 code + code_verifier 换取安装信息
 * 4. 成功后同步 tools + 重定向到 returnUrl
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import { HubClient } from "./client.js";
import { readBody } from "./webhook.js";

/** PKCE 缓存条目（含用户填写的 Google Key 配置） */
interface PKCEEntry {
  verifier: string;
  hub: string;
  appId: string;
  returnUrl: string;
  /** 用户在 setup 页面填写的 Google 凭证 */
  userConfig?: Record<string, string>;
  expiresAt: number;
}

/** PKCE 缓存，key 为 localState，10 分钟过期 */
const pkceCache = new Map<string, PKCEEntry>();

/** 缓存过期时间：10 分钟 */
const PKCE_TTL_MS = 10 * 60 * 1000;

/** 清理过期的 PKCE 条目 */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of pkceCache) {
    if (entry.expiresAt < now) {
      pkceCache.delete(key);
    }
  }
}

/**
 * 处理 OAuth 安装流程第一步：
 * GET  → 显示配置表单 HTML，让用户填写 Google 凭证
 * POST → 读取表单数据，生成 PKCE 并重定向到 Hub 授权页
 * 路由: GET/POST /oauth/setup
 */
export async function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const params = url.searchParams;

  const hub = params.get("hub") ?? config.hubUrl;
  const appId = params.get("app_id") ?? "";
  const botId = params.get("bot_id") ?? "";
  const state = params.get("state") ?? "";
  const returnUrl = params.get("return_url") ?? "";

  // POST 请求 — 用户提交了配置表单
  if (req.method === "POST") {
    const body = await readBody(req);
    const formData = new URLSearchParams(body.toString());
    const googleClientId = formData.get("google_client_id") || "";
    const googleClientSecret = formData.get("google_client_secret") || "";
    const googleRefreshToken = formData.get("google_refresh_token") || "";
    const googleRedirectUri = formData.get("google_redirect_uri") || "";

    if (!hub || !appId || !botId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少必填参数: hub, app_id, bot_id" }));
      return;
    }

    // 清理过期缓存
    cleanExpired();

    // 生成 PKCE
    const { codeVerifier, codeChallenge } = generatePKCE();
    const localState = crypto.randomUUID();

    // 缓存 PKCE + 用户填的 Key
    pkceCache.set(localState, {
      verifier: codeVerifier,
      hub,
      appId,
      returnUrl,
      userConfig: {
        google_client_id: googleClientId,
        google_client_secret: googleClientSecret,
        google_refresh_token: googleRefreshToken,
        google_redirect_uri: googleRedirectUri,
      },
      expiresAt: Date.now() + PKCE_TTL_MS,
    });

    // 重定向到 Hub 授权页
    const authUrl = new URL(`/api/apps/${appId}/oauth/authorize`, hub);
    if (botId) authUrl.searchParams.set("bot_id", botId);
    authUrl.searchParams.set("state", localState);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    if (state) authUrl.searchParams.set("hub_state", state);

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // GET 请求 — 显示配置表单 HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Google Workspace — 配置</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .desc { color: #666; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #3370ff; }
    .required::after { content: " *"; color: red; }
    button { width: 100%; padding: 12px; background: #3370ff; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
    button:hover { background: #2860e0; }
    .hint { font-size: 12px; color: #999; margin-top: -12px; margin-bottom: 16px; }
    a { color: #3370ff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Google Workspace</h1>
    <p class="desc">请填写您的 Google OAuth 凭证，用于连接 Google API</p>
    <form method="POST" action="/oauth/setup?hub=${encodeURIComponent(hub)}&app_id=${encodeURIComponent(appId)}&bot_id=${encodeURIComponent(botId)}&state=${encodeURIComponent(state)}&return_url=${encodeURIComponent(returnUrl)}">
      <label class="required">Google Client ID</label>
      <input name="google_client_id" placeholder="xxxx.apps.googleusercontent.com" required />
      <p class="hint">在 <a href="https://console.cloud.google.com/apis/credentials" target="_blank">GCP 控制台</a> 创建 OAuth 客户端后获取</p>

      <label class="required">Client Secret</label>
      <input name="google_client_secret" type="password" placeholder="OAuth 客户端密钥" required />

      <label class="required">Refresh Token</label>
      <input name="google_refresh_token" type="password" placeholder="通过 OAuth 授权流程获取" required />
      <p class="hint">使用 <a href="https://developers.google.com/oauthplayground" target="_blank">OAuth Playground</a> 或 CLI 工具获取</p>

      <label>Redirect URI（可选）</label>
      <input name="google_redirect_uri" placeholder="http://localhost:8086/google/callback" />
      <p class="hint">留空使用默认值</p>

      <button type="submit">确认并安装</button>
    </form>
  </div>
</body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/**
 * 处理 OAuth 回调（/oauth/callback）
 * 使用授权码 + code_verifier 换取安装信息并持久化
 *
 * 查询参数:
 *  - code: 授权码
 *  - state: 之前传出的 localState
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

  // 清理过期缓存
  cleanExpired();

  // 验证 state 并取出缓存信息
  const pending = pkceCache.get(state);
  if (!pending) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或已过期的 state" }));
    return;
  }
  pkceCache.delete(state);

  try {
    // 用 code + code_verifier 换取安装信息
    const exchangeUrl = `${pending.hub.replace(/\/+$/, "")}/api/apps/${pending.appId}/oauth/exchange`;
    const tokenRes = await fetch(exchangeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: pending.verifier,
      }),
      signal: AbortSignal.timeout(30_000),
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
      hubUrl: pending.hub,
      appId: tokenData.app_id,
      botId: tokenData.bot_id,
      appToken: tokenData.app_token,
      webhookSecret: tokenData.webhook_secret,
      createdAt: new Date().toISOString(),
    });

    console.log(
      `[OAuth] 安装成功: installation_id=${tokenData.installation_id}`,
    );

    // 将用户在 setup 页面填写的 Google Key 加密存储到本地
    if (pending.userConfig && Object.values(pending.userConfig).some((v) => v)) {
      store.saveConfig(tokenData.installation_id, pending.userConfig, tokenData.app_token);
      console.log("[OAuth] 用户配置已加密存储");
    }

    // 安装成功后拉取用户配置并加密存储到本地
    {
      const hubClient = new HubClient(pending.hub, tokenData.app_token);
      try {
        const remoteConfig = await hubClient.fetchConfig();
        if (Object.keys(remoteConfig).length > 0) {
          store.saveConfig(tokenData.installation_id, remoteConfig, tokenData.app_token);
          console.log(`[OAuth] 已拉取并加密保存配置: ${tokenData.installation_id}`);
        }
      } catch (err) {
        console.error("[OAuth] 拉取配置失败:", err);
      }

      // 成功后同步工具定义到 Hub
      if (tools && tools.length > 0) {
        await hubClient.syncTools(tools).catch((err) => {
          console.error("[OAuth] 同步工具失败:", err);
        });
      }
    }

    // 重定向到 returnUrl（如果有的话），否则返回 JSON
    if (pending.returnUrl) {
      res.writeHead(302, { Location: pending.returnUrl });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          message: "安装成功",
          installation_id: tokenData.installation_id,
        }),
      );
    }
  } catch (err) {
    console.error("[OAuth] 回调处理异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部服务器错误" }));
  }
}
