import type { Request, Response, NextFunction } from "express";
import { verifyInitData } from "../lib/telegramAuth";

/**
 * Express middleware that enforces admin-only access.
 * Reads ADMIN_ID from env (never hardcoded), verifies the Telegram initData
 * from the X-Telegram-InitData header, and rejects anyone whose user_id
 * doesn't match ADMIN_ID.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminId = Number(process.env["ADMIN_ID"]);
  if (!adminId) {
    res.status(503).json({ error: "ADMIN_ID env var not set" });
    return;
  }

  // Accept either BOT_TOKEN or TELEGRAM_BOT_TOKEN, matching getBotConfig() in routes/telegram.ts
  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    res.status(503).json({ error: "BOT_TOKEN / TELEGRAM_BOT_TOKEN env var not set" });
    return;
  }

  const initData =
    (req.headers["x-telegram-initdata"] as string | undefined) ||
    (req.body?.initData as string | undefined);

  if (!initData) {
    res.status(401).json({ error: "Missing Telegram initData" });
    return;
  }

  const user = verifyInitData(initData, token);
  if (!user || user.id !== adminId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  next();
}
