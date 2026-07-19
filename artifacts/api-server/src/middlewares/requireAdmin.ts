import type { Request, Response, NextFunction } from "express";
import { verifyInitData } from "../lib/telegramAuth";

// Both Telegram user IDs have full admin access
export const ADMIN_IDS = [6145230334, 868999453];

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
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
  if (!user || !ADMIN_IDS.includes(user.id)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  next();
}
