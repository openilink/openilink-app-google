/**
 * 基于 better-sqlite3 的本地持久化存储
 * 包含 installations（安装信息）和 message_links（消息关联）两张表
 */

import Database from "better-sqlite3";
import type { Installation, MessageLink } from "./hub/types.js";
import { encryptConfig, decryptConfig } from "./utils/config-crypto.js";

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // 启用 WAL 模式提升并发性能
    this.db.pragma("journal_mode = WAL");
    this.initTables();
  }

  /** 初始化数据库表结构 */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS installations (
        id TEXT PRIMARY KEY,
        hub_url TEXT NOT NULL,
        app_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        app_token TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS message_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        installation_id TEXT NOT NULL,
        google_msg_id TEXT NOT NULL,
        google_thread_id TEXT NOT NULL,
        wx_user_id TEXT NOT NULL,
        wx_user_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (installation_id) REFERENCES installations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_message_links_google_msg
        ON message_links(google_msg_id);
      CREATE INDEX IF NOT EXISTS idx_message_links_wx_user
        ON message_links(installation_id, wx_user_id);
    `);

    /** 追加 encrypted_config 列（已有表平滑迁移） */
    try {
      this.db.exec(`ALTER TABLE installations ADD COLUMN encrypted_config TEXT NOT NULL DEFAULT ''`);
    } catch {
      // 列已存在则忽略
    }
  }

  /** 保存或更新安装信息 */
  saveInstallation(installation: Installation): void {
    const stmt = this.db.prepare(`
      INSERT INTO installations (id, hub_url, app_id, bot_id, app_token, webhook_secret, created_at)
      VALUES (@id, @hubUrl, @appId, @botId, @appToken, @webhookSecret, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        hub_url = @hubUrl,
        app_id = @appId,
        bot_id = @botId,
        app_token = @appToken,
        webhook_secret = @webhookSecret
    `);

    stmt.run({
      id: installation.id,
      hubUrl: installation.hubUrl,
      appId: installation.appId,
      botId: installation.botId,
      appToken: installation.appToken,
      webhookSecret: installation.webhookSecret,
      createdAt: installation.createdAt ?? new Date().toISOString(),
    });
  }

  /** 根据 ID 获取安装信息 */
  getInstallation(id: string): Installation | undefined {
    const row = this.db
      .prepare("SELECT * FROM installations WHERE id = ?")
      .get(id) as Record<string, string> | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      hubUrl: row.hub_url,
      appId: row.app_id,
      botId: row.bot_id,
      appToken: row.app_token,
      webhookSecret: row.webhook_secret,
      createdAt: row.created_at,
    };
  }

  /** 获取所有安装信息 */
  getAllInstallations(): Installation[] {
    const rows = this.db
      .prepare("SELECT * FROM installations ORDER BY created_at DESC")
      .all() as Record<string, string>[];

    return rows.map((row) => ({
      id: row.id,
      hubUrl: row.hub_url,
      appId: row.app_id,
      botId: row.bot_id,
      appToken: row.app_token,
      webhookSecret: row.webhook_secret,
      createdAt: row.created_at,
    }));
  }

  /** 保存消息关联记录 */
  saveMessageLink(link: MessageLink): void {
    const stmt = this.db.prepare(`
      INSERT INTO message_links (installation_id, google_msg_id, google_thread_id, wx_user_id, wx_user_name, created_at)
      VALUES (@installationId, @googleMsgId, @googleThreadId, @wxUserId, @wxUserName, @createdAt)
    `);

    stmt.run({
      installationId: link.installationId,
      googleMsgId: link.googleMsgId,
      googleThreadId: link.googleThreadId,
      wxUserId: link.wxUserId,
      wxUserName: link.wxUserName,
      createdAt: link.createdAt ?? new Date().toISOString(),
    });
  }

  /** 根据 Google 消息 ID 和安装实例 ID 查找关联记录 */
  getMessageLinkByGoogleMsg(googleMsgId: string, installationId: string): MessageLink | undefined {
    const row = this.db
      .prepare("SELECT * FROM message_links WHERE google_msg_id = ? AND installation_id = ? LIMIT 1")
      .get(googleMsgId, installationId) as Record<string, any> | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      installationId: row.installation_id,
      googleMsgId: row.google_msg_id,
      googleThreadId: row.google_thread_id,
      wxUserId: row.wx_user_id,
      wxUserName: row.wx_user_name,
      createdAt: row.created_at,
    };
  }

  /** 获取指定微信用户的最新关联记录 */
  getLatestLinkByWxUser(
    installationId: string,
    wxUserId: string,
  ): MessageLink | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM message_links
         WHERE installation_id = ? AND wx_user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(installationId, wxUserId) as Record<string, any> | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      installationId: row.installation_id,
      googleMsgId: row.google_msg_id,
      googleThreadId: row.google_thread_id,
      wxUserId: row.wx_user_id,
      wxUserName: row.wx_user_name,
      createdAt: row.created_at,
    };
  }

  /* ======================== encrypted_config CRUD ======================== */

  /**
   * 将配置加密后保存到对应安装记录
   * @param installationId - 安装实例 ID
   * @param plainConfig    - 明文配置对象
   * @param appToken       - 用于派生加密密钥的 app_token
   */
  saveConfig(installationId: string, plainConfig: Record<string, string>, appToken: string): void {
    const cipher = encryptConfig(plainConfig, appToken);
    this.db
      .prepare("UPDATE installations SET encrypted_config = ? WHERE id = ?")
      .run(cipher, installationId);
  }

  /**
   * 读取并解密指定安装的配置
   * @param installationId - 安装实例 ID
   * @param appToken       - 用于派生解密密钥的 app_token
   * @returns 解密后的配置对象，若无配置则返回 undefined
   */
  getConfig(installationId: string, appToken: string): Record<string, string> | undefined {
    const row = this.db
      .prepare("SELECT encrypted_config FROM installations WHERE id = ?")
      .get(installationId) as { encrypted_config: string } | undefined;
    if (!row || !row.encrypted_config) return undefined;
    return decryptConfig(row.encrypted_config, appToken);
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}
