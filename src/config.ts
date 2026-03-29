/**
 * 应用配置接口与加载逻辑
 * Google API 使用 OAuth2（client_id + client_secret + refresh_token），无长连接模式
 */

export interface Config {
  /** HTTP 服务端口，默认 "8086" */
  port: string;
  /** Hub 服务地址，必填 */
  hubUrl: string;
  /** 本应用对外可访问的基础 URL，必填 */
  baseUrl: string;
  /** SQLite 数据库文件路径，默认 "data/google.db" */
  dbPath: string;
  /** Google OAuth Client ID，必填 */
  googleClientId: string;
  /** Google OAuth Client Secret，必填 */
  googleClientSecret: string;
  /** Google OAuth Refresh Token（预先获取），必填 */
  googleRefreshToken: string;
  /** Google OAuth 回调地址，默认 "http://localhost:8086/google/callback" */
  googleRedirectUri: string;
}

/**
 * 从环境变量加载配置，缺少必填项时抛出错误
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const port = env.PORT ?? "8086";

  const config: Config = {
    port,
    hubUrl: env.HUB_URL ?? "",
    baseUrl: env.BASE_URL ?? "",
    dbPath: env.DB_PATH ?? "data/google.db",
    googleClientId: env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    googleRefreshToken: env.GOOGLE_REFRESH_TOKEN ?? "",
    googleRedirectUri:
      env.GOOGLE_REDIRECT_URI ?? `http://localhost:${port}/google/callback`,
  };

  // 校验必填字段
  const required: (keyof Config)[] = [
    "hubUrl",
    "baseUrl",
    "googleClientId",
    "googleClientSecret",
    "googleRefreshToken",
  ];

  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`缺少必填配置项: ${missing.join(", ")}`);
  }

  return config;
}
