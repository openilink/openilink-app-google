/**
 * 应用入口
 * 启动 HTTP 服务，整合 OAuth、Webhook、Gmail 轮询、桥接和 AI Tools
 *
 * Google Workspace 没有 WebSocket/Gateway 长连接机制，
 * 新邮件检测采用 Gmail 轮询代替。
 */

import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { Router } from "./router.js";
import { GoogleClient } from "./google/client.js";
import { startGmailPolling } from "./google/event.js";
import { handleOAuthSetup, handleOAuthRedirect } from "./hub/oauth.js";
import { handleWebhook } from "./hub/webhook.js";
import { HubClient } from "./hub/client.js";
import { manifest } from "./hub/manifest.js";
import { collectAllTools } from "./tools/index.js";
import { WxToGoogle } from "./bridge/wx-to-google.js";
import { GoogleToWx } from "./bridge/google-to-wx.js";
import type { HubEvent, ToolContext } from "./hub/types.js";

// 加载配置
const config = loadConfig();

// 确保数据库目录存在
mkdirSync(dirname(config.dbPath), { recursive: true });

// 初始化存储
const store = new Store(config.dbPath);

// 初始化 Google API 客户端
const googleClient = new GoogleClient(
  config.googleClientId,
  config.googleClientSecret,
  config.googleRefreshToken,
  config.googleRedirectUri,
);

// 收集所有工具定义和处理器（共 18 个）
const { definitions: toolDefinitions, handlers: toolHandlers } =
  collectAllTools(googleClient);

console.log(`[App] 已注册 ${toolDefinitions.length} 个 AI Tools`);

// 将工具定义转换为 Hub 同步格式
const toolsForHub = toolDefinitions.map((t) => ({
  name: t.name,
  description: t.description,
  command: t.command,
  parameters: t.parameters,
}));

// 初始化桥接模块
const wxToGoogle = new WxToGoogle(googleClient, store);
const googleToWx = new GoogleToWx(store);

/**
 * 向指定安装同步工具定义
 */
async function syncToolsToInstallation(hubUrl: string, appToken: string): Promise<void> {
  const client = new HubClient(hubUrl, appToken);
  await client.syncTools(toolsForHub);
}

/**
 * 启动时遍历所有已有安装，同步工具定义
 */
async function syncToolsOnStartup(): Promise<void> {
  const installations = store.getAllInstallations();
  if (installations.length === 0) {
    console.log("[App] 暂无安装记录，跳过启动时工具同步");
    return;
  }

  console.log(`[App] 启动时同步工具到 ${installations.length} 个安装...`);
  for (const inst of installations) {
    try {
      await syncToolsToInstallation(inst.hubUrl, inst.appToken);
    } catch (err) {
      console.error(`[App] 同步工具到安装 ${inst.id} 失败:`, err);
    }
  }
}

/**
 * 处理 command 事件（同步/异步响应模式）
 * 在 SYNC_DEADLINE 内完成则同步返回，超时则异步推送
 */
async function onCommand(event: HubEvent, installationId: string): Promise<string> {
  const installation = store.getInstallation(installationId);
  if (!installation) {
    return `未找到安装: ${installationId}`;
  }

  const data = event.event?.data;
  if (!data) return "缺少事件数据";

  const command = data.command as string;
  const args = (data.args as Record<string, any>) ?? {};
  const userId = data.user_id as string;

  const handler = toolHandlers.get(command);
  if (!handler) {
    return `未知指令: ${command}`;
  }

  try {
    const ctx: ToolContext = {
      installationId,
      botId: event.bot.id,
      userId,
      traceId: event.trace_id,
      args,
    };
    const result = await handler(ctx);
    return result;
  } catch (err) {
    console.error(`[Event] 工具调用失败: ${command}`, err);
    return `工具 ${command} 执行失败`;
  }
}

/**
 * 处理收到的非 command Hub 事件
 * 根据事件类型分发处理：消息 → 桥接
 */
async function onEvent(event: HubEvent, installationId: string): Promise<void> {
  const installation = store.getInstallation(installationId);
  if (!installation) {
    console.warn(`[Event] 未找到安装信息: ${installationId}`);
    return;
  }

  const hubClient = new HubClient(installation.hubUrl, installation.appToken);
  const eventData = event.event;

  if (!eventData) {
    console.warn(`[Event] 事件缺少 event 字段: trace_id=${event.trace_id}`);
    return;
  }

  console.log(
    `[Event] 收到事件: type=${eventData.type}, id=${eventData.id}, trace_id=${event.trace_id}`,
  );

  // 处理消息事件 — 通过桥接转发到 Gmail
  if (eventData.type === "message") {
    const data = eventData.data;
    const userId = data.user_id as string;

    try {
      await wxToGoogle.handleWxEvent(event, installation);
      await hubClient.sendText(
        event.bot.id,
        userId,
        "消息已转发至 Gmail 邮箱",
      );
    } catch (err) {
      console.error("[Event] 消息桥接失败:", err);
      await hubClient.sendText(
        event.bot.id,
        userId,
        "消息转发失败，请稍后重试",
      );
    }
  }
}

// 创建路由
const router = new Router();

// 健康检查
router.get("/healthz", (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

// 应用清单
router.get("/manifest", (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(manifest));
});

// OAuth 安装流程
router.get("/oauth/setup", (req, res) => {
  handleOAuthSetup(req, res, config);
});

// OAuth 回调（传入工具定义以便同步）
router.get("/oauth/callback", (req, res) => {
  return handleOAuthRedirect(req, res, config, store, toolsForHub);
});

// Webhook 事件接收（传入 command 处理器）
router.post("/webhook", (req, res) => {
  return handleWebhook(req, res, store, onEvent, onCommand);
});

// 创建 HTTP 服务
const server = createServer((req, res) => {
  router.handle(req, res);
});

// 启动 Gmail 轮询（Google Workspace 无实时推送，需轮询检测新邮件）
const pollingHandle = startGmailPolling(googleClient, async (event) => {
  const installations = store.getAllInstallations();
  await googleToWx.handleNewMail(event, installations);
});

// 启动 HTTP 服务
server.listen(Number(config.port), () => {
  console.log(`[App] Google Workspace Hub App 已启动`);
  console.log(`[App] 监听端口: ${config.port}`);
  console.log(`[App] Hub 地址: ${config.hubUrl}`);
  console.log(`[App] 基础 URL: ${config.baseUrl}`);
  console.log(`[App] 已加载工具: ${toolDefinitions.map((t) => t.name).join(", ")}`);

  // 启动后同步工具到所有已有安装
  syncToolsOnStartup().catch((err) => {
    console.error("[App] 启动时同步工具异常:", err);
  });
});

// 优雅退出：停止轮询 + 关闭数据库 + 关闭 HTTP 服务
function shutdown(): void {
  console.log("[App] 正在关闭...");
  pollingHandle.stop();
  store.close();
  server.close(() => {
    console.log("[App] 已退出");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
