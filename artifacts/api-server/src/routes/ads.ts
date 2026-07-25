/**
 * AdsGram Ad-watched endpoint
 *
 *   POST /api/ads/watched   — record a completed ad view; reward coins
 *   GET  /api/ads/status    — user's ad watches today + reward config
 *
 * Admin settings (in gm_settings):
 *   ad_reward_coins   — coins rewarded per ad view (default: 10)
 *   ad_daily_limit    — max ad views per user per day (default: 10)
 */

import { Router, type IRouter } from "express";
import { verifyOrParseInitData } from "../lib/telegramAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

// ── Lazy migration ─────────────────────────────────────────────────────────────
let migrated = false;
async function ensureAdsSchema() {
  if (migrated) return;
  migrated = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(
      `ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS ad_watches integer NOT NULL DEFAULT 0`,
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_ad_watches (
        id          serial PRIMARY KEY,
        telegram_id bigint NOT NULL,
        coins_earned integer NOT NULL DEFAULT 0,
        watched_at  timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS gm_ad_watches_tg_idx ON gm_ad_watches (telegram_id, watched_at)`,
    );
    // Seed default ad settings if not present
    await pool.query(`
      INSERT INTO gm_settings (key, value)
      SELECT key, value FROM (VALUES
        ('ad_reward_coins', '10'),
        ('ad_daily_limit',  '10')
      ) AS v(key, value)
      WHERE NOT EXISTS (SELECT 1 FROM gm_settings WHERE key = v.key)
    `);
  } catch (e) {
    logger.warn({ e }, "ads schema migration skipped");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAdSettings(): Promise<{ rewardCoins: number; dailyLimit: number }> {
  try {
    const { pool } = await import("@workspace/db");
    const res = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM gm_settings WHERE key IN ('ad_reward_coins','ad_daily_limit')`,
    );
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.key] = r.value;
    return {
      rewardCoins: parseInt(map["ad_reward_coins"] ?? "10", 10) || 10,
      dailyLimit:  parseInt(map["ad_daily_limit"]  ?? "10", 10) || 10,
    };
  } catch {
    return { rewardCoins: 10, dailyLimit: 10 };
  }
}

async function watchesToday(telegramId: number | string): Promise<number> {
  try {
    const { pool } = await import("@workspace/db");
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM gm_ad_watches
       WHERE telegram_id=$1 AND watched_at >= NOW() - INTERVAL '24 hours'`,
      [telegramId],
    );
    return parseInt(res.rows[0]?.count ?? "0", 10);
  } catch {
    return 0;
  }
}

// ── POST /api/ads/watched ─────────────────────────────────────────────────────
router.post("/ads/watched", async (req, res): Promise<void> => {
  const token = getBotToken();

  const { initData } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }

  const user = verifyOrParseInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureAdsSchema();

  try {
    const { pool } = await import("@workspace/db");

    const settings = await getAdSettings();
    const todayCount = await watchesToday(user.id);

    if (todayCount >= settings.dailyLimit) {
      res.status(429).json({
        error: "Daily ad limit reached",
        limit: settings.dailyLimit,
        watched: todayCount,
      });
      return;
    }

    // Credit coins + increment total ad_watches — pure raw SQL (ad_watches not in Drizzle schema)
    await pool.query(
      `UPDATE gm_users
       SET coins = coins + $1,
           ad_watches = COALESCE(ad_watches, 0) + 1
       WHERE telegram_id = $2`,
      [settings.rewardCoins, user.id],
    );

    // Log the watch event
    await pool.query(
      `INSERT INTO gm_ad_watches (telegram_id, coins_earned) VALUES ($1, $2)`,
      [user.id, settings.rewardCoins],
    );

    const newToday = todayCount + 1;
    const remaining = Math.max(0, settings.dailyLimit - newToday);

    logger.info({ telegramId: user.id, coinsEarned: settings.rewardCoins }, "ad watched");

    // Update referral conditions (fire-and-forget — don't block the response)
    import("./referrals").then(m => {
      m.updateReferralCondition(user.id, "ad").catch(() => {});
    }).catch(() => {});

    res.json({
      ok: true,
      coinsEarned: settings.rewardCoins,
      watchedToday: newToday,
      remainingToday: remaining,
      dailyLimit: settings.dailyLimit,
    });
  } catch (err) {
    logger.error({ err }, "POST /ads/watched failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/ads/status ───────────────────────────────────────────────────────
router.get("/ads/status", async (req, res): Promise<void> => {
  const token = getBotToken();
  const initData = req.headers["x-init-data"] as string | undefined;

  await ensureAdsSchema();
  const settings = await getAdSettings();

  if (!token || !initData) {
    res.json({ watchedToday: 0, remainingToday: settings.dailyLimit, ...settings });
    return;
  }

  const user = verifyOrParseInitData(initData, token);
  if (!user) {
    res.json({ watchedToday: 0, remainingToday: settings.dailyLimit, ...settings });
    return;
  }

  const watched = await watchesToday(user.id);
  res.json({
    watchedToday: watched,
    remainingToday: Math.max(0, settings.dailyLimit - watched),
    rewardCoins: settings.rewardCoins,
    dailyLimit: settings.dailyLimit,
  });
});

export default router;
