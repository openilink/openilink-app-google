/**
 * 配置模块测试
 * 验证默认值、必填项校验逻辑
 */

import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  /** 构建包含所有必填项的最小环境变量 */
  const validEnv = {
    HUB_URL: "https://hub.example.com",
    BASE_URL: "https://app.example.com",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REFRESH_TOKEN: "test-refresh-token",
  };

  it("应使用默认端口 8086", () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe("8086");
  });

  it("应允许自定义端口", () => {
    const config = loadConfig({ ...validEnv, PORT: "3000" });
    expect(config.port).toBe("3000");
  });

  it("应使用默认数据库路径 data/google.db", () => {
    const config = loadConfig(validEnv);
    expect(config.dbPath).toBe("data/google.db");
  });

  it("应允许自定义数据库路径", () => {
    const config = loadConfig({ ...validEnv, DB_PATH: "/tmp/test.db" });
    expect(config.dbPath).toBe("/tmp/test.db");
  });

  it("应生成默认的 Google 回调地址", () => {
    const config = loadConfig(validEnv);
    expect(config.googleRedirectUri).toBe(
      "http://localhost:8086/google/callback",
    );
  });

  it("应允许自定义 Google 回调地址", () => {
    const config = loadConfig({
      ...validEnv,
      GOOGLE_REDIRECT_URI: "https://custom.example.com/callback",
    });
    expect(config.googleRedirectUri).toBe(
      "https://custom.example.com/callback",
    );
  });

  it("缺少 HUB_URL 时应抛出错误", () => {
    const { HUB_URL: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow("hubUrl");
  });

  it("缺少 BASE_URL 时应抛出错误", () => {
    const { BASE_URL: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow("baseUrl");
  });

  it("缺少 GOOGLE_CLIENT_ID 时应抛出错误", () => {
    const { GOOGLE_CLIENT_ID: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow("googleClientId");
  });

  it("缺少 GOOGLE_CLIENT_SECRET 时应抛出错误", () => {
    const { GOOGLE_CLIENT_SECRET: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow("googleClientSecret");
  });

  it("缺少 GOOGLE_REFRESH_TOKEN 时应抛出错误", () => {
    const { GOOGLE_REFRESH_TOKEN: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow("googleRefreshToken");
  });

  it("缺少多个必填项时应全部列出", () => {
    expect(() => loadConfig({})).toThrow("hubUrl");
  });

  it("所有必填项齐全时应正常返回配置", () => {
    const config = loadConfig(validEnv);
    expect(config.hubUrl).toBe("https://hub.example.com");
    expect(config.baseUrl).toBe("https://app.example.com");
    expect(config.googleClientId).toBe("test-client-id");
    expect(config.googleClientSecret).toBe("test-client-secret");
    expect(config.googleRefreshToken).toBe("test-refresh-token");
  });
});
