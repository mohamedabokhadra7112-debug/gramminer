/**
 * Referral routes:
 *   GET  /api/telegram/referrals      — user's referral stats + milestones + progress (enriched)
 *   GET  /api/admin/referral-milestones        — admin: list milestones
 *   POST /api/admin/referral-milestones        — admin: create milestone
 *   PATCH /api/admin/referral-milestones/:id   — admin: update milestone
 *   DELETE /api/admin/referral-milestones/:id  — admin: delete milestone
 */

import { Router, type IRouter } from "express";
import { verifyInitData } from "../lib/telegramAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

// ── Lazy migration ────────────────────────────────────────────────────────────
let migratedReferrals = false;
async function ensureReferralSchema() {
  if (migratedReferrals) return;
  migratedReferrals = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_referral_milestones (
        id           serial PRIMARY KEY,
        invite_count integer NOT NULL,
        reward_coins integer NOT NULL DEFAULT 0,
        is_enabled   boolean NOT NULL DEFAULT true,
        created_at   timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_referral_milestone_credits (
        id           serial PRIMARY KEY,
        telegram_id  bigint  NOT NULL,
        milestone_id integer NOT NULL,
        credited_at  timestamp NOT NULL DEFAULT NOW(),
        UNIQUE(telegram_id, milestone_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_referrals (
        id            serial PRIMARY KEY,
        referrer_id   bigint  NOT NULL,
        referred_id   bigint  NOT NULL UNIQUE,
        reward_paid   boolean NOT NULL DEFAULT false,
        status        text    NOT NULL DEFAULT 'pending',
        login_count   integer NOT NULL DEFAULT 0,
        ads_watched   integer NOT NULL DEFAULT 0,
        combo_done    boolean NOT NULL DEFAULT false,
        created_at    timestamp NOT NULL DEFAULT NOW()
      )
    `);
    // Add new columns to existing table if missing
    for (const col of [
      `ALTER TABLE gm_referrals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE gm_referrals ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0`,
      `ALTER TABLE gm_referrals ADD COLUMN IF NOT EXISTS ads_watched integer NOT NULL DEFAULT 0`,
      `ALTER TABLE gm_referrals ADD COLUMN IF NOT EXISTS combo_done boolean NOT NULL DEFAULT false`,
    ]) {
      await pool.query(col).catch(() => {});
    }
    await pool.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS referred_by bigint`).catch(() => {});
    await pool.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0`).catch(() => {});
    // IP tracking for fraud detection
    await pool.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS registration_ip text`).catch(() => {});
    await pool.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS withdraw_ip_blocked boolean NOT NULL DEFAULT false`).catch(() => {});
  } catch (e) {
    logger.warn({ e }, "referral schema migration skipped");
  }
}

/**
 * Called when a referred user completes an activity.
 * Updates their referral conditions and auto-confirms when all are met.
 * type: 'login' | 'combo' | 'ad'
 */
export async function updateReferralCondition(
  referredId: number,
  type: "login" | "combo" | "ad",
): Promise<void> {
  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");

    // Find this user's referral record
    const ref = await pool.query<{
      id: number; referrer_id: string; status: string;
      login_count: number; ads_watched: number; combo_done: boolean;
    }>(
      `SELECT id, referrer_id, status, login_count, ads_watched, combo_done
       FROM gm_referrals WHERE referred_id = $1 LIMIT 1`,
      [referredId],
    );
    if (!ref.rows.length) return; // not a referred user
    const row = ref.rows[0]!;
    if (row.status === "confirmed") return; // already confirmed, nothing to do

    // Determine update
    let setPart = "";
    if (type === "login") {
      setPart = `login_count = LEAST(login_count + 1, 9999)`;
    } else if (type === "combo") {
      setPart = `combo_done = true`;
    } else if (type === "ad") {
      setPart = `ads_watched = LEAST(ads_watched + 1, 9999)`;
    }

    // Apply update and re-read conditions
    const updated = await pool.query<{
      login_count: number; ads_watched: number; combo_done: boolean;
    }>(
      `UPDATE gm_referrals SET ${setPart}
       WHERE id = $1
       RETURNING login_count, ads_watched, combo_done`,
      [row.id],
    );
    const cond = updated.rows[0];
    if (!cond) return;

    // Check if all conditions are met: login >= 1, ads >= 5, combo_done = true
    if (cond.login_count >= 1 && cond.ads_watched >= 5 && cond.combo_done) {
      // Confirm the referral
      await pool.query(
        `UPDATE gm_referrals SET status = 'confirmed' WHERE id = $1`,
        [row.id],
      );

      // Credit referrer (if not already paid)
      if (!row.status.includes("paid")) {
        // Get referral reward amount
        let rewardCoins = 1;
        try {
          const r = await pool.query<{ value: string }>(
            `SELECT value FROM gm_settings WHERE key='referral_price' LIMIT 1`,
          );
          rewardCoins = Number(r.rows[0]?.value ?? 1) || 1;
        } catch { /* default */ }

        await pool.query(
          `UPDATE gm_users SET coins = coins + $1 WHERE telegram_id = $2`,
          [rewardCoins, row.referrer_id],
        );
        await pool.query(
          `UPDATE gm_referrals SET reward_paid = true WHERE id = $1`,
          [row.id],
        );

        // Notify referrer
        const referrerId = Number(row.referrer_id);
        await notifyTelegram(
          referrerId,
          `🎉 <b>تم تأكيد إحالتك!</b>\n\n` +
          `دعوتك تمت المصادقة عليها ✅\n` +
          `🪙 تم إضافة <b>${rewardCoins} coin</b> إلى رصيدك.`,
        );

        // Check milestones
        await creditNewMilestones(referrerId).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn({ e }, "updateReferralCondition failed");
  }
}

/**
 * Check if a user's IP is blocked due to IP-based fraud (>10 accounts same IP).
 * Also flags all accounts on that IP if threshold is exceeded.
 */
export async function checkIpFraud(telegramId: number, ip: string): Promise<void> {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return;
  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");

    // Save IP if not already stored
    await pool.query(
      `UPDATE gm_users SET registration_ip = $1
       WHERE telegram_id = $2 AND registration_ip IS NULL`,
      [ip, telegramId],
    );

    // Count accounts with same IP
    const countRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM gm_users WHERE registration_ip = $1`,
      [ip],
    );
    const count = Number(countRes.rows[0]?.count ?? 0);
    if (count > 10) {
      // Block all accounts from this IP from withdrawals
      await pool.query(
        `UPDATE gm_users SET withdraw_ip_blocked = true WHERE registration_ip = $1`,
        [ip],
      );
      logger.warn({ ip, count }, "IP fraud: blocked all accounts from this IP");
    }
  } catch (e) {
    logger.warn({ e }, "checkIpFraud failed");
  }
}

async function notifyTelegram(chatId: number, text: string) {
  const token = getBotToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

/**
 * Credit newly reached milestones for a referrer.
 * Called after a successful referral is recorded.
 * Returns list of newly credited milestone IDs.
 */
export async function creditNewMilestones(referrerId: number): Promise<number[]> {
  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");

    // Count this user's referrals
    const countRes = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM gm_referrals WHERE referrer_id=$1",
      [referrerId],
    );
    const referralCount = Number(countRes.rows[0]?.count ?? 0);

    // Load enabled milestones not yet credited to this user
    const milestonesRes = await pool.query<{
      id: number; invite_count: number; reward_coins: number;
    }>(`
      SELECT m.id, m.invite_count, m.reward_coins
      FROM gm_referral_milestones m
      WHERE m.is_enabled = true
        AND m.invite_count <= $1
        AND NOT EXISTS (
          SELECT 1 FROM gm_referral_milestone_credits c
          WHERE c.telegram_id = $2 AND c.milestone_id = m.id
        )
      ORDER BY m.invite_count
    `, [referralCount, referrerId]);

    const credited: number[] = [];
    for (const milestone of milestonesRes.rows) {
      try {
        // Insert credit record (idempotency via UNIQUE)
        const ins = await pool.query(
          `INSERT INTO gm_referral_milestone_credits (telegram_id, milestone_id)
           VALUES ($1, $2)
           ON CONFLICT (telegram_id, milestone_id) DO NOTHING
           RETURNING id`,
          [referrerId, milestone.id],
        );
        if ((ins.rowCount ?? 0) === 0) continue; // already credited

        // Credit coins
        await pool.query(
          `UPDATE gm_users SET coins = coins + $1 WHERE telegram_id = $2`,
          [milestone.reward_coins, referrerId],
        );
        credited.push(milestone.id);

        // Notify user
        await notifyTelegram(
          referrerId,
          `🏆 <b>تهانينا! وصلت إلى إنجاز إحالة!</b>\n\n` +
          `👥 لقد قمت بدعوة <b>${milestone.invite_count}</b> صديق!\n` +
          `🪙 تم إضافة <b>${milestone.reward_coins} coin</b> إلى رصيدك.`,
        );

        logger.info({ referrerId, milestoneId: milestone.id, reward: milestone.reward_coins }, "Referral milestone credited");
      } catch (e) {
        logger.warn({ e, milestoneId: milestone.id }, "Failed to credit milestone");
      }
    }
    return credited;
  } catch (e) {
    logger.warn({ e }, "creditNewMilestones failed");
    return [];
  }
}

// ── GET /api/telegram/referrals — enriched with milestones ───────────────────
router.get("/telegram/referrals", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.status(400).json({ error: "x-init-data required" }); return; }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");
    const db = await getDb();

    // Referral counts (total, confirmed, pending)
    const countRes = await pool.query<{ total: string; confirmed: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='confirmed') AS confirmed
       FROM gm_referrals WHERE referrer_id=$1`,
      [user.id],
    );
    const referralCount  = Number(countRes.rows[0]?.total ?? 0);
    const confirmedCount = Number(countRes.rows[0]?.confirmed ?? 0);
    const pendingCount   = referralCount - confirmedCount;

    // Referral price
    let referralPrice = 1;
    if (db) {
      try {
        const { settingsTable } = await import("@workspace/db");
        const { eq } = await import("drizzle-orm");
        const [priceRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "referral_price"));
        if (priceRow?.value) referralPrice = Number(priceRow.value) || 1;
      } catch { /* use default */ }
    }

    // Milestones
    const milestonesRes = await pool.query<{
      id: number; invite_count: number; reward_coins: number; is_enabled: boolean;
    }>(`
      SELECT id, invite_count, reward_coins, is_enabled
      FROM gm_referral_milestones
      WHERE is_enabled = true
      ORDER BY invite_count
    `);

    // Already credited milestones for this user
    const creditedRes = await pool.query<{ milestone_id: number }>(
      "SELECT milestone_id FROM gm_referral_milestone_credits WHERE telegram_id=$1",
      [user.id],
    );
    const creditedSet = new Set(creditedRes.rows.map(r => r.milestone_id));

    const milestones = milestonesRes.rows.map(m => ({
      id: m.id,
      inviteCount: m.invite_count,
      rewardCoins: m.reward_coins,
      isEnabled: m.is_enabled,
      reached: referralCount >= m.invite_count,
      credited: creditedSet.has(m.id),
    }));

    res.json({
      count:         referralCount,
      confirmed:     confirmedCount,
      pending:       pendingCount,
      reward:        +(confirmedCount * referralPrice).toFixed(4),
      referralPrice,
      milestones,
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, "GET /telegram/referrals failed");
    res.json({ count: 0, reward: 0, referralPrice: 1, milestones: [] });
  }
});

// ── Admin milestone CRUD ──────────────────────────────────────────────────────
const adminRouter: IRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/referral-milestones
adminRouter.get("/admin/referral-milestones", async (_req, res) => {
  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{
      id: number; invite_count: number; reward_coins: number; is_enabled: boolean; created_at: string;
    }>("SELECT * FROM gm_referral_milestones ORDER BY invite_count");
    res.json(result.rows.map(r => ({
      id: r.id,
      inviteCount: r.invite_count,
      rewardCoins: r.reward_coins,
      isEnabled: r.is_enabled,
      createdAt: r.created_at,
    })));
  } catch (err) {
    logger.error({ err }, "GET /admin/referral-milestones failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/admin/referral-milestones
adminRouter.post("/admin/referral-milestones", async (req, res): Promise<void> => {
  const { inviteCount, rewardCoins, isEnabled = true } = (req.body ?? {}) as {
    inviteCount?: unknown; rewardCoins?: unknown; isEnabled?: unknown;
  };
  const ic = Number(inviteCount);
  const rc = Number(rewardCoins);
  if (!Number.isInteger(ic) || ic <= 0) {
    res.status(400).json({ error: "inviteCount must be a positive integer" }); return;
  }
  if (!Number.isInteger(rc) || rc < 0) {
    res.status(400).json({ error: "rewardCoins must be a non-negative integer" }); return;
  }
  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ id: number }>(
      `INSERT INTO gm_referral_milestones (invite_count, reward_coins, is_enabled)
       VALUES ($1, $2, $3) RETURNING id`,
      [ic, rc, Boolean(isEnabled)],
    );
    res.json({ ok: true, id: result.rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "POST /admin/referral-milestones failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// PATCH /api/admin/referral-milestones/:id
adminRouter.patch("/admin/referral-milestones/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updates: string[] = [];
  const params: unknown[] = [];

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.inviteCount !== undefined) {
    const v = Number(body.inviteCount);
    if (!Number.isInteger(v) || v <= 0) { res.status(400).json({ error: "Invalid inviteCount" }); return; }
    params.push(v); updates.push(`invite_count=$${params.length}`);
  }
  if (body.rewardCoins !== undefined) {
    const v = Number(body.rewardCoins);
    if (!Number.isInteger(v) || v < 0) { res.status(400).json({ error: "Invalid rewardCoins" }); return; }
    params.push(v); updates.push(`reward_coins=$${params.length}`);
  }
  if (body.isEnabled !== undefined) {
    params.push(Boolean(body.isEnabled)); updates.push(`is_enabled=$${params.length}`);
  }
  if (updates.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");
    params.push(id);
    await pool.query(
      `UPDATE gm_referral_milestones SET ${updates.join(", ")} WHERE id=$${params.length}`,
      params,
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PATCH /admin/referral-milestones failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/admin/referral-milestones/:id
adminRouter.delete("/admin/referral-milestones/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await ensureReferralSchema();
    const { pool } = await import("@workspace/db");
    await pool.query("DELETE FROM gm_referral_milestones WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /admin/referral-milestones failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// Combine user + admin routes
router.use(adminRouter);

export default router;
