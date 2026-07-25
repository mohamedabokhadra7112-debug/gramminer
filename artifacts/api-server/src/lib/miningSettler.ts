/**
 * Background mining settler.
 * Every 30 minutes, auto-credits accumulated gram for every user
 * who has active store purchases — so mining continues even when
 * the user has the bot closed.
 */

import { logger } from "./logger";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function runMiningCycle() {
  const { pool } = await import("@workspace/db");

  // Get all purchases with principal remaining
  const purchases = await pool.query<{
    id: number;
    telegram_id: string;
    daily_mining_pct: number;
    principal_remaining: number;
    last_claim_at: Date | null;
  }>(
    `SELECT id, telegram_id, daily_mining_pct, principal_remaining, last_claim_at
     FROM gm_store_purchases
     WHERE principal_remaining > 0`,
  );

  if (!purchases.rows.length) return;

  const now = new Date();

  // Group by telegram_id so we do one DB update per user
  const userEarnings = new Map<string, { earned: number; purchaseIds: number[] }>();

  for (const p of purchases.rows) {
    const lastClaim = p.last_claim_at ? new Date(p.last_claim_at) : null;
    const elapsedMs = lastClaim ? now.getTime() - lastClaim.getTime() : MS_PER_DAY;

    if (elapsedMs < 60_000) continue; // less than 1 minute — skip

    // Cap at 7 days unclaimed
    const fraction = Math.min(elapsedMs / MS_PER_DAY, 7);
    const earned = Math.round(p.daily_mining_pct * p.principal_remaining * fraction * 1_000_000) / 1_000_000;

    if (earned <= 0) continue;

    const tid = p.telegram_id;
    const existing = userEarnings.get(tid) ?? { earned: 0, purchaseIds: [] };
    existing.earned += earned;
    existing.purchaseIds.push(p.id);
    userEarnings.set(tid, existing);
  }

  if (!userEarnings.size) return;

  let credited = 0;

  for (const [telegramId, { earned, purchaseIds }] of userEarnings) {
    try {
      // Credit gram to user balance
      await pool.query(
        `UPDATE gm_users
         SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision,
             last_active_at = $2
         WHERE telegram_id = $3`,
        [earned, now, telegramId],
      );

      // Update last_claim_at for each purchase
      await pool.query(
        `UPDATE gm_store_purchases
         SET last_claim_at = $1
         WHERE id = ANY($2::int[])`,
        [now, purchaseIds],
      );

      // Log earnings
      await pool.query(
        `INSERT INTO gm_earnings_log (telegram_id, amount) VALUES ($1, $2)`,
        [telegramId, earned],
      ).catch(() => {});

      credited++;
    } catch (err) {
      logger.error({ err, telegramId }, "miningSettler: failed to credit user");
    }
  }

  if (credited > 0) {
    logger.info({ users: credited, total: userEarnings.size }, "Mining cycle: credited users");
  }
}

export function startMiningSettler() {
  // Run once after 1 minute (to let DB connections settle), then every 30 minutes
  setTimeout(async () => {
    await runMiningCycle().catch(err =>
      logger.error({ err }, "Mining settler initial run failed"),
    );
    setInterval(async () => {
      await runMiningCycle().catch(err =>
        logger.error({ err }, "Mining settler interval failed"),
      );
    }, 30 * 60 * 1000); // 30 minutes
  }, 60_000);

  logger.info("Mining settler started (30-min interval)");
}
