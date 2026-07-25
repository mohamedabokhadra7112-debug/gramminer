import { Router, type IRouter } from "express";
import healthRouter      from "./health";
import telegramRouter    from "./telegram";
import adminRouter       from "./admin";
import userPrefsRouter   from "./userPrefs";
import tasksRouter       from "./tasks";
import withdrawRouter    from "./withdraw";
import manifestRouter    from "./manifest";
import referralsRouter   from "./referrals";
import depositsRouter    from "./deposits";
import swapRouter        from "./swap";
import storeRouter       from "./store";
import leaderboardRouter from "./leaderboard";
import tournamentRouter  from "./tournament";
import adsRouter         from "./ads";

const router: IRouter = Router();

// Direct routes registered BEFORE all sub-routers to bypass any
// requireAdmin middleware that sub-routers mount without a path prefix.

// Public task list
router.get("/tasks", async (_req, res): Promise<void> => {
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT id, title, description, reward, is_daily AS "isDaily",
              channel_username AS "channelUsername", task_type AS "taskType",
              join_link AS "joinLink", chat_id AS "chatId"
       FROM gm_tasks
       WHERE is_hidden=false AND (is_enabled IS NULL OR is_enabled=true)
       ORDER BY created_at`,
    );
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

// Completed tasks for a user (with timestamps for daily countdown)
router.get("/tasks/completed", async (req, res): Promise<void> => {
  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  const initData = req.headers["x-init-data"] as string | undefined;
  if (!token || !initData) { res.json([]); return; }

  const { verifyInitData: verify } = await import("../lib/telegramAuth");
  const user = verify(initData, token);
  if (!user) { res.json([]); return; }

  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT tc.task_id, tc.completed_at, COALESCE(t.is_daily, false) AS is_daily
       FROM gm_task_completions tc
       LEFT JOIN gm_tasks t ON t.id = tc.task_id
       WHERE tc.telegram_id = $1`,
      [user.id],
    );
    res.json(result.rows.map((r: Record<string, unknown>) => ({
      taskId:      r["task_id"],
      completedAt: r["completed_at"],
      isDaily:     r["is_daily"],
    })));
  } catch {
    res.json([]);
  }
});

// Public store settings (admin-configurable prices, no auth needed)
router.get("/store/settings", async (_req, res): Promise<void> => {
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM gm_settings
       WHERE key IN ('store_coins_per_gram','store_daily_gram','store_monthly_gram')`,
    );
    const m: Record<string, string> = {};
    for (const r of result.rows) m[r.key] = r.value;
    res.json({
      coinsPerGram: parseFloat(m["store_coins_per_gram"] ?? "700")  || 700,
      dailyGram:    parseFloat(m["store_daily_gram"]     ?? "0.05") || 0.05,
      monthlyGram:  parseFloat(m["store_monthly_gram"]   ?? "1.50") || 1.50,
    });
  } catch {
    res.json({ coinsPerGram: 700, dailyGram: 0.05, monthlyGram: 1.50 });
  }
});

// Public store products (no auth needed)
router.get("/store/products", async (_req, res): Promise<void> => {
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT id, name, description, coin_price, gram_value, daily_mining_pct, is_enabled, created_at
       FROM gm_store_products WHERE is_enabled=true ORDER BY coin_price`,
    );
    res.json(result.rows.map((r: Record<string, unknown>) => ({
      id:            r["id"],
      name:          r["name"],
      description:   r["description"],
      coinPrice:     r["coin_price"],
      gramValue:     r["gram_value"],
      dailyMiningPct: r["daily_mining_pct"],
      isEnabled:     r["is_enabled"],
      createdAt:     r["created_at"],
    })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.use(healthRouter);
router.use(manifestRouter);
router.use(leaderboardRouter);
router.use(tournamentRouter);
router.use(referralsRouter);
router.use(depositsRouter);
router.use(swapRouter);
router.use(storeRouter);
router.use(adsRouter);
router.use(tasksRouter);
router.use(withdrawRouter);
router.use(telegramRouter);
router.use(adminRouter);
router.use(userPrefsRouter);

export default router;
