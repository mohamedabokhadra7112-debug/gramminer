/**
 * GET /api/leaderboard — top 20 users by gram balance (public, no auth)
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/leaderboard", async (_req, res): Promise<void> => {
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{
      telegram_id: string;
      first_name: string | null;
      last_name: string | null;
      username: string | null;
      balance: string;
    }>(`
      SELECT telegram_id, first_name, last_name, username, balance
      FROM gm_users
      WHERE is_banned = false
      ORDER BY balance DESC
      LIMIT 20
    `);

    res.json(
      result.rows.map((r, i) => ({
        rank:       i + 1,
        telegramId: Number(r.telegram_id),
        firstName:  r.first_name  ?? null,
        lastName:   r.last_name   ?? null,
        username:   r.username    ?? null,
        balance:    Number(r.balance),
      })),
    );
  } catch (err) {
    logger.error({ err }, "GET /leaderboard failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
