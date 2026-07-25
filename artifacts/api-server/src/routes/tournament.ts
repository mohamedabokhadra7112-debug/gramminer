/**
 * Tournament routes
 *
 * Public:
 *   GET  /api/tournament/active  — active tournament + current top-N leaderboard
 *
 * Admin (via admin.ts handler for type=tournament):
 *   GET    /api/admin/general?type=tournament            — list all tournaments
 *   POST   /api/admin/general?type=tournament            — create tournament
 *   DELETE /api/admin/general?type=tournament&id=N       — cancel tournament
 *   POST   /api/admin/general?type=tournament&action=settle&id=N — manual settle
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── lazy migrate ─────────────────────────────────────────────────────────────
async function ensureTournamentTable() {
  const { pool } = await import("@workspace/db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gm_tournaments (
      id          SERIAL PRIMARY KEY,
      title       TEXT    NOT NULL,
      top_n       INTEGER NOT NULL DEFAULT 10,
      prizes      TEXT    NOT NULL DEFAULT '[]',
      starts_at   TIMESTAMPTZ NOT NULL,
      ends_at     TIMESTAMPTZ NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'active',
      snapshot    TEXT,
      settled_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ─── GET /api/tournament/active ──────────────────────────────────────────────
router.get("/tournament/active", async (_req, res): Promise<void> => {
  try {
    await ensureTournamentTable();
    const { pool } = await import("@workspace/db");

    const now = new Date();
    const tRes = await pool.query<{
      id: number; title: string; top_n: number; prizes: string;
      starts_at: Date; ends_at: Date; status: string;
    }>(
      `SELECT id, title, top_n, prizes, starts_at, ends_at, status
       FROM gm_tournaments
       WHERE status = 'active' AND ends_at > $1
       ORDER BY ends_at ASC
       LIMIT 1`,
      [now],
    );

    if (tRes.rows.length === 0) {
      res.json({ tournament: null });
      return;
    }

    const t = tRes.rows[0]!;
    const topN = t.top_n;

    const lbRes = await pool.query<{
      telegram_id: string; first_name: string | null;
      last_name: string | null; username: string | null; balance: string;
    }>(
      `SELECT telegram_id, first_name, last_name, username, balance
       FROM gm_users
       WHERE is_banned = false
       ORDER BY balance DESC
       LIMIT $1`,
      [topN],
    );

    res.json({
      tournament: {
        id:       t.id,
        title:    t.title,
        topN,
        prizes:   JSON.parse(t.prizes),
        startsAt: t.starts_at,
        endsAt:   t.ends_at,
        status:   t.status,
      },
      leaderboard: lbRes.rows.map((r, i) => ({
        rank:       i + 1,
        telegramId: Number(r.telegram_id),
        firstName:  r.first_name ?? null,
        lastName:   r.last_name  ?? null,
        username:   r.username   ?? null,
        balance:    Number(r.balance),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /tournament/active failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
