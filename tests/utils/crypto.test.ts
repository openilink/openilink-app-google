/**
 * 加密工具模块测试
 * 验证 Webhook 签名校验和 PKCE 参数生成
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, generatePKCE } from "../../src/utils/crypto.js";

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const body = '{"type":"event","data":"hello"}';

  /** 用 HMAC-SHA256 生成合法签名 */
  function makeSignature(payload: string, key: string): string {
    return createHmac("sha256", key).update(payload).digest("hex");
  }

  it("合法签名应返回 true", () => {
    const sig = makeSignature(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("使用 Buffer 形式的 body 也应通过验证", () => {
    const buf = Buffer.from(body);
    const sig = makeSignature(body, secret);
    expect(verifySignature(buf, sig, secret)).toBe(true);
  });

  it("错误签名应返回 false", () => {
    expect(verifySignature(body, "invalid-signature", secret)).toBe(false);
  });

  it("空签名应返回 false", () => {
    expect(verifySignature(body, "", secret)).toBe(false);
  });

  it("空密钥应返回 false", () => {
    const sig = makeSignature(body, secret);
    expect(verifySignature(body, sig, "")).toBe(false);
  });

  it("不同密钥生成的签名应不匹配", () => {
    const sig = makeSignature(body, "wrong-secret");
    expect(verifySignature(body, sig, secret)).toBe(false);
  });
});

describe("generatePKCE", () => {
  it("应生成 codeVerifier 和 codeChallenge", () => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    expect(codeVerifier).toBeTruthy();
    expect(codeChallenge).toBeTruthy();
  });

  it("codeVerifier 长度应在 43-128 之间", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it("每次生成的结果应不同", () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });

  it("codeVerifier 应只包含 base64url 安全字符", () => {
    const { codeVerifier } = generatePKCE();
    // base64url: A-Z, a-z, 0-9, -, _
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
