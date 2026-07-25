import { createHmac } from "node:crypto";
import { logger } from "./logger";

export type TelegramAuthUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

/**
 * Parses user from initData WITHOUT verifying HMAC.
 * Use ONLY when BOT_TOKEN is unavailable (dev / missing-secrets fallback).
 * NEVER trust this in production with real money operations.
 */
export function parseInitDataUser(initData: string): TelegramAuthUser | null {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as TelegramAuthUser;
    if (!user?.id) return null;
    logger.warn({ userId: user.id }, "⚠️  initData parsed WITHOUT HMAC verification — set TELEGRAM_BOT_TOKEN for security");
    return user;
  } catch {
    return null;
  }
}

/**
 * Tries full HMAC verification first; falls back to unsafe parse if no token.
 */
export function verifyOrParseInitData(
  initData: string,
  token: string | null | undefined,
): TelegramAuthUser | null {
  if (token) return verifyInitData(initData, token);
  return parseInitDataUser(initData);
}

/**
 * Validates Telegram WebApp initData using HMAC-SHA256.
 * Returns the verified user or null if invalid / expired.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(
  initData: string,
  token: string,
): TelegramAuthUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw) as TelegramAuthUser;
  } catch {
    return null;
  }
}
