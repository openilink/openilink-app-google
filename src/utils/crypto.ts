/**
 * 加密工具：Webhook 签名验证 + OAuth PKCE 支持
 */

import { createHmac, randomBytes, createHash } from "node:crypto";

/**
 * 验证 Webhook 签名
 * 使用 HMAC-SHA256 比对请求体签名，防止请求伪造
 *
 * @param body - 原始请求体（Buffer 或字符串）
 * @param signature - 请求头中携带的签名值
 * @param secret - Webhook 密钥
 * @returns 签名是否有效
 */
export function verifySignature(
  body: Buffer | string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  const expected = hmac.digest("hex");

  // 使用恒定时间比较，防止时序攻击
  if (expected.length !== signature.length) return false;

  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 生成 OAuth PKCE 参数（code_verifier + code_challenge）
 * 用于 OAuth 2.0 授权码 + PKCE 流程
 *
 * @returns { codeVerifier, codeChallenge } 对
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // 生成 43~128 字符的随机 code_verifier
  const codeVerifier = randomBytes(32)
    .toString("base64url")
    .slice(0, 64);

  // code_challenge = BASE64URL(SHA256(code_verifier))
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}
