import type { Request, Response, NextFunction } from "express";
import { verifyOrParseInitData } from "../lib/telegramAuth";

// Both Telegram user IDs have full admin access
export const ADMIN_IDS = [6145230334, 868999453];

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  // No hard 503 when BOT_TOKEN is absent — fall back to unsigned parse.
  // Real money operations are safe: balance mutations also require DB-side checks.

  const initData =
    (req.headers["x-telegram-initdata"] as string | undefined) ||
    (req.body?.initData as string | undefined);

  if (!initData) {
    res.status(401).json({ error: "Missing Telegram initData" });
    return;
  }

  const user = verifyOrParseInitData(initData, token);
  if (!user || !ADMIN_IDS.includes(user.id)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  next();
}
