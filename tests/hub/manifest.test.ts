/**
 * Manifest 模块测试
 * 验证应用清单结构和内容
 */

import { describe, it, expect } from "vitest";
import { manifest } from "../../src/hub/manifest.js";

describe("manifest", () => {
  it("应包含必要字段", () => {
    expect(manifest.slug).toBeDefined();
    expect(manifest.name).toBeDefined();
    expect(manifest.icon).toBeDefined();
    expect(manifest.description).toBeDefined();
    expect(manifest.events).toBeDefined();
  });

  it("slug 应为 google-workspace", () => {
    expect(manifest.slug).toBe("google-workspace");
  });

  it("名称应为 Google Workspace", () => {
    expect(manifest.name).toBe("Google Workspace");
  });

  it("应订阅 message 和 command 事件", () => {
    expect(manifest.events).toContain("message");
    expect(manifest.events).toContain("command");
  });

  it("描述应包含主要功能关键词", () => {
    expect(manifest.description).toContain("Google Workspace");
    expect(manifest.description).toContain("Gmail");
  });

  it("icon 应为非空字符串", () => {
    expect(manifest.icon.length).toBeGreaterThan(0);
  });
});
