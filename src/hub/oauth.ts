/**
 * OAuth2 + PKCE 安装流程
 *
 * 1. Hub 访问 /oauth/setup → 本模块生成 PKCE，重定向到 Hub 授权页
 *    查询参数: hub, app_id, bot_id, state(hub_state), return_url
 * 2. Hub 授权完成后回调 /oauth/callback → 用 code + code_verifier 换取安装信息
 *    Exchange: POST {hub}/api/apps/{appId}/oauth/exchange body: {code, code_verifier}
 * 3. 成功后同步 tools + 重定向到 returnUrl
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import { HubClient } from "./client.js";

/** 临时存储 PKCE localState → {verifier, hub, appId, returnUrl} */
const pendingStates = new Map<
  string,
  { verifier: string; hub: string; appId: string; returnUrl: string }
>();

/**
 * 处理 OAuth 安装请求（/oauth/setup）
 * 生成 PKCE 参数并重定向到 Hub 授权页面
 *
 * 查询参数:
 *  - hub: Hub 地址
 *  - app_id: 应用 ID
 *  - bot_id: Bot ID
 *  - state: Hub 侧传来的 state（hub_state）
 *  - return_url: 安装完成后重定向地址
 */
export function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const hub = url.searchParams.get("hub");
  const appId = url.searchParams.get("app_id");
  const botId = url.searchParams.get("bot_id") ?? "";
  const hubState = url.searchParams.get("state") ?? "";
  const returnUrl = url.searchParams.get("return_url") ?? "";

  if (!hub || !appId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 hub 或 app_id 参数" }));
    return;
  }

  // 生成 PKCE 参数
  const { codeVerifier, codeChallenge } = generatePKCE();

  // 生成本地随机 localState，缓存关键信息
  const localState = crypto.randomUUID();
  pendingStates.set(localState, {
    verifier: codeVerifier,
    hub,
    appId,
    returnUrl,
  });

  // 5 分钟后自动清理，防止内存泄漏
  setTimeout(() => pendingStates.delete(localState), 5 * 60 * 1000);

  // 构造 Hub 授权 URL: {hub}/api/apps/{appId}/oauth/authorize
  const authUrl = new URL(`/api/apps/${appId}/oauth/authorize`, hub);
  if (botId) authUrl.searchParams.set("bot_id", botId);
  authUrl.searchParams.set("state", localState);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  if (hubState) authUrl.searchParams.set("hub_state", hubState);

  // 重定向到 Hub 授权页面
  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
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

  // 验证 state 并取出缓存信息
  const pending = pendingStates.get(state);
  if (!pending) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或已过期的 state" }));
    return;
  }
  pendingStates.delete(state);

  try {
    // 用 code + code_verifier 换取安装信息
    // POST {hub}/api/apps/{appId}/oauth/exchange
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
