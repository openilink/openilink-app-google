/**
 * Store 模块测试
 * 验证安装信息管理、消息映射（googleMsgId、googleThreadId）
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { Store } from "../src/store.js";

describe("Store", () => {
  const testDbPath = "/tmp/openilink-test-store.db";
  let store: Store;

  beforeEach(() => {
    // 清理旧数据库
    try {
      rmSync(testDbPath, { force: true });
    } catch {
      // 忽略
    }
    store = new Store(testDbPath);
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(testDbPath, { force: true });
    } catch {
      // 忽略
    }
  });

  describe("安装信息管理", () => {
    const installation = {
      id: "inst-001",
      hubUrl: "https://hub.example.com",
      appId: "app-001",
      botId: "bot-001",
      appToken: "token-abc",
      webhookSecret: "secret-xyz",
      createdAt: "2026-01-01T00:00:00Z",
    };

    it("应能保存并读取安装信息", () => {
      store.saveInstallation(installation);
      const result = store.getInstallation("inst-001");
      expect(result).toBeDefined();
      expect(result!.id).toBe("inst-001");
      expect(result!.hubUrl).toBe("https://hub.example.com");
      expect(result!.appToken).toBe("token-abc");
    });

    it("应能更新已有安装信息", () => {
      store.saveInstallation(installation);
      store.saveInstallation({
        ...installation,
        appToken: "new-token",
      });
      const result = store.getInstallation("inst-001");
      expect(result!.appToken).toBe("new-token");
    });

    it("查询不存在的安装信息应返回 undefined", () => {
      const result = store.getInstallation("nonexistent");
      expect(result).toBeUndefined();
    });

    it("应能获取所有安装信息", () => {
      store.saveInstallation(installation);
      store.saveInstallation({
        ...installation,
        id: "inst-002",
        createdAt: "2026-01-02T00:00:00Z",
      });
      const all = store.getAllInstallations();
      expect(all).toHaveLength(2);
    });
  });

  describe("消息映射", () => {
    const installation = {
      id: "inst-001",
      hubUrl: "https://hub.example.com",
      appId: "app-001",
      botId: "bot-001",
      appToken: "token-abc",
      webhookSecret: "secret-xyz",
    };

    beforeEach(() => {
      store.saveInstallation(installation);
    });

    it("应能保存并根据 googleMsgId 查找消息关联", () => {
      store.saveMessageLink({
        installationId: "inst-001",
        googleMsgId: "gmail-msg-001",
        googleThreadId: "gmail-thread-001",
        wxUserId: "wx-user-001",
        wxUserName: "张三",
      });

      const link = store.getMessageLinkByGoogleMsg("gmail-msg-001");
      expect(link).toBeDefined();
      expect(link!.googleMsgId).toBe("gmail-msg-001");
      expect(link!.googleThreadId).toBe("gmail-thread-001");
      expect(link!.wxUserId).toBe("wx-user-001");
      expect(link!.wxUserName).toBe("张三");
    });

    it("查询不存在的 googleMsgId 应返回 undefined", () => {
      const link = store.getMessageLinkByGoogleMsg("nonexistent");
      expect(link).toBeUndefined();
    });

    it("应能根据微信用户获取最新关联记录", () => {
      // 保存两条记录
      store.saveMessageLink({
        installationId: "inst-001",
        googleMsgId: "gmail-msg-001",
        googleThreadId: "gmail-thread-001",
        wxUserId: "wx-user-001",
        wxUserName: "张三",
        createdAt: "2026-01-01T00:00:00Z",
      });
      store.saveMessageLink({
        installationId: "inst-001",
        googleMsgId: "gmail-msg-002",
        googleThreadId: "gmail-thread-001",
        wxUserId: "wx-user-001",
        wxUserName: "张三",
        createdAt: "2026-01-02T00:00:00Z",
      });

      const latest = store.getLatestLinkByWxUser("inst-001", "wx-user-001");
      expect(latest).toBeDefined();
      expect(latest!.googleMsgId).toBe("gmail-msg-002");
    });

    it("不同安装实例的消息关联应互相隔离", () => {
      store.saveInstallation({
        ...installation,
        id: "inst-002",
      });

      store.saveMessageLink({
        installationId: "inst-001",
        googleMsgId: "gmail-msg-001",
        googleThreadId: "gmail-thread-001",
        wxUserId: "wx-user-001",
        wxUserName: "张三",
      });

      const link = store.getLatestLinkByWxUser("inst-002", "wx-user-001");
      expect(link).toBeUndefined();
    });
  });
});
