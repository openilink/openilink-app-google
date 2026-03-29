/**
 * Google Workspace SDK 封装
 * 提供 Gmail / Calendar / Drive / Docs / Sheets 的统一客户端
 */
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { gmail_v1 } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import type { docs_v1 } from 'googleapis';
import type { sheets_v4 } from 'googleapis';

export class GoogleClient {
  private auth: OAuth2Client;
  private gmail: gmail_v1.Gmail;
  private calendar: calendar_v3.Calendar;
  private drive: drive_v3.Drive;
  private docs: docs_v1.Docs;
  private sheets: sheets_v4.Sheets;

  constructor(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    redirectUri?: string,
  ) {
    // 初始化 OAuth2 客户端，设置 refresh_token 后会自动刷新 access_token
    this.auth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri ?? 'https://developers.google.com/oauthplayground',
    );
    this.auth.setCredentials({ refresh_token: refreshToken });

    // 初始化各服务客户端
    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
    this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.docs = google.docs({ version: 'v1', auth: this.auth });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  // ==================== Gmail ====================

  /**
   * 发送邮件
   * @param to 收件人地址
   * @param subject 邮件主题
   * @param body 邮件正文
   * @param html 是否使用 HTML 格式，默认 false
   * @returns Gmail 消息 ID
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    html?: boolean,
  ): Promise<string> {
    try {
      const contentType = html ? 'text/html' : 'text/plain';
      // 构造 RFC 2822 格式的邮件
      const rawMessage = [
        `To: ${to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Content-Type: ${contentType}; charset=UTF-8`,
        `MIME-Version: 1.0`,
        '',
        body,
      ].join('\r\n');

      // 转换为 base64url 编码
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });

      console.log(`[Gmail] 邮件发送成功，messageId: ${res.data.id}`);
      return res.data.id!;
    } catch (err) {
      console.error('[Gmail] 发送邮件失败:', err);
      throw err;
    }
  }

  /**
   * 列出邮件
   * @param query Gmail 搜索查询语句（与 Gmail 搜索栏语法相同）
   * @param maxResults 最大返回数量，默认 10
   * @returns 邮件摘要列表
   */
  async listEmails(query?: string, maxResults?: number): Promise<any[]> {
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: maxResults ?? 10,
        q: query,
      });

      const messages = res.data.messages ?? [];
      console.log(`[Gmail] 列出邮件 ${messages.length} 封`);
      return messages;
    } catch (err) {
      console.error('[Gmail] 列出邮件失败:', err);
      throw err;
    }
  }

  /**
   * 获取邮件详情
   * @param messageId Gmail 消息 ID
   * @returns 完整邮件对象
   */
  async getEmail(messageId: string): Promise<any> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      console.log(`[Gmail] 获取邮件成功，messageId: ${messageId}`);
      return res.data;
    } catch (err) {
      console.error(`[Gmail] 获取邮件失败，messageId: ${messageId}:`, err);
      throw err;
    }
  }

  /**
   * 回复邮件
   * @param messageId 要回复的邮件 ID
   * @param body 回复正文
   * @returns 新消息 ID
   */
  async replyEmail(messageId: string, body: string): Promise<string> {
    try {
      // 获取原始邮件，提取 threadId、收件人、主题
      const original = await this.getEmail(messageId);
      const threadId = original.threadId;
      const headers = original.payload?.headers ?? [];

      const fromHeader = headers.find(
        (h: any) => h.name?.toLowerCase() === 'from',
      );
      const subjectHeader = headers.find(
        (h: any) => h.name?.toLowerCase() === 'subject',
      );
      const messageIdHeader = headers.find(
        (h: any) => h.name?.toLowerCase() === 'message-id',
      );

      const to = fromHeader?.value ?? '';
      const subject = subjectHeader?.value?.startsWith('Re:')
        ? subjectHeader.value
        : `Re: ${subjectHeader?.value ?? ''}`;

      // 构造回复邮件 RFC 2822 格式
      const rawParts = [
        `To: ${to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Content-Type: text/plain; charset=UTF-8`,
        `MIME-Version: 1.0`,
      ];

      // 添加 In-Reply-To 和 References 头，保证线程关联
      if (messageIdHeader?.value) {
        rawParts.push(`In-Reply-To: ${messageIdHeader.value}`);
        rawParts.push(`References: ${messageIdHeader.value}`);
      }

      rawParts.push('', body);

      const rawMessage = rawParts.join('\r\n');
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId,
        },
      });

      console.log(`[Gmail] 回复邮件成功，新 messageId: ${res.data.id}`);
      return res.data.id!;
    } catch (err) {
      console.error(`[Gmail] 回复邮件失败，原始 messageId: ${messageId}:`, err);
      throw err;
    }
  }

  // ==================== Calendar ====================

  /**
   * 列出日历事件
   * @param timeMin 开始时间（ISO 8601 格式）
   * @param timeMax 结束时间（ISO 8601 格式）
   * @param maxResults 最大返回数量，默认 10
   * @returns 日历事件列表
   */
  async listEvents(
    timeMin?: string,
    timeMax?: string,
    maxResults?: number,
  ): Promise<any[]> {
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin ?? new Date().toISOString(),
        timeMax,
        maxResults: maxResults ?? 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = res.data.items ?? [];
      console.log(`[Calendar] 列出事件 ${events.length} 个`);
      return events;
    } catch (err) {
      console.error('[Calendar] 列出事件失败:', err);
      throw err;
    }
  }

  /**
   * 创建日历事件
   * @param summary 事件标题
   * @param startTime 开始时间（ISO 8601）
   * @param endTime 结束时间（ISO 8601）
   * @param description 事件描述
   * @param attendees 参与者邮箱列表
   * @returns 创建的事件对象
   */
  async createEvent(
    summary: string,
    startTime: string,
    endTime: string,
    description?: string,
    attendees?: string[],
  ): Promise<any> {
    try {
      const event: calendar_v3.Schema$Event = {
        summary,
        description,
        start: {
          dateTime: startTime,
          timeZone: 'Asia/Shanghai',
        },
        end: {
          dateTime: endTime,
          timeZone: 'Asia/Shanghai',
        },
      };

      if (attendees?.length) {
        event.attendees = attendees.map((email) => ({ email }));
      }

      const res = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      console.log(`[Calendar] 创建事件成功，eventId: ${res.data.id}`);
      return res.data;
    } catch (err) {
      console.error('[Calendar] 创建事件失败:', err);
      throw err;
    }
  }

  /**
   * 删除日历事件
   * @param eventId 事件 ID
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });
      console.log(`[Calendar] 删除事件成功，eventId: ${eventId}`);
    } catch (err) {
      console.error(`[Calendar] 删除事件失败，eventId: ${eventId}:`, err);
      throw err;
    }
  }

  /**
   * 查询忙闲状态
   * @param emails 要查询的邮箱列表
   * @param timeMin 开始时间（ISO 8601）
   * @param timeMax 结束时间（ISO 8601）
   * @returns 忙闲信息
   */
  async getFreeBusy(
    emails: string[],
    timeMin: string,
    timeMax: string,
  ): Promise<any> {
    try {
      const res = await this.calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          items: emails.map((id) => ({ id })),
        },
      });

      console.log(`[Calendar] 查询忙闲状态成功，共 ${emails.length} 个用户`);
      return res.data;
    } catch (err) {
      console.error('[Calendar] 查询忙闲状态失败:', err);
      throw err;
    }
  }

  // ==================== Drive ====================

  /**
   * 列出文件
   * @param query Drive 搜索查询语句
   * @param maxResults 最大返回数量，默认 10
   * @returns 文件列表
   */
  async listFiles(query?: string, maxResults?: number): Promise<any[]> {
    try {
      const res = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
        pageSize: maxResults ?? 10,
      });

      const files = res.data.files ?? [];
      console.log(`[Drive] 列出文件 ${files.length} 个`);
      return files;
    } catch (err) {
      console.error('[Drive] 列出文件失败:', err);
      throw err;
    }
  }

  /**
   * 按名称搜索文件
   * @param name 文件名关键词
   * @returns 匹配的文件列表
   */
  async searchFiles(name: string): Promise<any[]> {
    try {
      const escapedName = name.replace(/'/g, "\\'");
      const query = `name contains '${escapedName}' and trashed = false`;
      return await this.listFiles(query);
    } catch (err) {
      console.error(`[Drive] 搜索文件失败，关键词: ${name}:`, err);
      throw err;
    }
  }

  /**
   * 创建文件夹
   * @param name 文件夹名称
   * @param parentId 父文件夹 ID
   * @returns 新建文件夹的 ID
   */
  async createFolder(name: string, parentId?: string): Promise<string> {
    try {
      const fileMetadata: drive_v3.Schema$File = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentId) {
        fileMetadata.parents = [parentId];
      }

      const res = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });

      console.log(`[Drive] 创建文件夹成功，folderId: ${res.data.id}`);
      return res.data.id!;
    } catch (err) {
      console.error(`[Drive] 创建文件夹失败，名称: ${name}:`, err);
      throw err;
    }
  }

  // ==================== Docs ====================

  /**
   * 创建 Google 文档
   * @param title 文档标题
   * @returns 文档 ID 和 URL
   */
  async createDoc(title: string): Promise<{ docId: string; url: string }> {
    try {
      const res = await this.docs.documents.create({
        requestBody: { title },
      });

      const docId = res.data.documentId!;
      const url = `https://docs.google.com/document/d/${docId}/edit`;

      console.log(`[Docs] 创建文档成功，docId: ${docId}`);
      return { docId, url };
    } catch (err) {
      console.error(`[Docs] 创建文档失败，标题: ${title}:`, err);
      throw err;
    }
  }

  /**
   * 获取 Google 文档内容
   * @param documentId 文档 ID
   * @returns 文档对象
   */
  async getDoc(documentId: string): Promise<any> {
    try {
      const res = await this.docs.documents.get({ documentId });
      console.log(`[Docs] 获取文档成功，documentId: ${documentId}`);
      return res.data;
    } catch (err) {
      console.error(
        `[Docs] 获取文档失败，documentId: ${documentId}:`,
        err,
      );
      throw err;
    }
  }

  // ==================== Sheets ====================

  /**
   * 读取表格数据
   * @param spreadsheetId 电子表格 ID
   * @param range 范围（如 "Sheet1!A1:D10"）
   * @returns 二维数组形式的数据
   */
  async readSheet(spreadsheetId: string, range: string): Promise<any[][]> {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = res.data.values ?? [];
      console.log(
        `[Sheets] 读取数据成功，${values.length} 行`,
      );
      return values;
    } catch (err) {
      console.error(
        `[Sheets] 读取数据失败，spreadsheetId: ${spreadsheetId}, range: ${range}:`,
        err,
      );
      throw err;
    }
  }

  /**
   * 写入表格数据（覆盖指定范围）
   * @param spreadsheetId 电子表格 ID
   * @param range 范围
   * @param values 二维数组数据
   */
  async writeSheet(
    spreadsheetId: string,
    range: string,
    values: any[][],
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      console.log(
        `[Sheets] 写入数据成功，${values.length} 行`,
      );
    } catch (err) {
      console.error(
        `[Sheets] 写入数据失败，spreadsheetId: ${spreadsheetId}, range: ${range}:`,
        err,
      );
      throw err;
    }
  }

  /**
   * 追加表格数据
   * @param spreadsheetId 电子表格 ID
   * @param range 范围
   * @param values 二维数组数据
   */
  async appendSheet(
    spreadsheetId: string,
    range: string,
    values: any[][],
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      console.log(
        `[Sheets] 追加数据成功，${values.length} 行`,
      );
    } catch (err) {
      console.error(
        `[Sheets] 追加数据失败，spreadsheetId: ${spreadsheetId}, range: ${range}:`,
        err,
      );
      throw err;
    }
  }
}
