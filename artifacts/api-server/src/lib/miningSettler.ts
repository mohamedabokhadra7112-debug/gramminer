/**
 * Background mining settler.
 *
 * Formula (as per spec):
 *   Daily Reward = Total Coins × 5% / coins_per_gram
 *   Example: 700 coins × 5% / 700 = 0.05 gram/day
 *
 * Runs every 30 minutes. Tracks per-user last_mining_at so rewards
 * accumulate correctly even when the bot is closed.
 */

import { logger } from "./logger";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

let schemaMigrated = false;
async function ensureMiningColumn() {
  if (schemaMigrated) return;
  schemaMigrated = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(
      `ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS last_mining_at timestamp`,
    );
  } catch { /* ignore */ }
}

async function getCoinsPerGram(): Promise<number> {
  try {
    const { pool } = await import("@workspace/db");
    const r = await pool.query<{ value: string }>(
      `SELECT value FROM gm_settings WHERE key='store_coins_per_gram' LIMIT 1`,
    );
    return parseFloat(r.rows[0]?.value ?? "700") || 700;
  } catch {
    return 700;
  }
}

async function runMiningCycle() {
  const { pool } = await import("@workspace/db");
  await ensureMiningColumn();

  const coinsPerGram = await getCoinsPerGram();

  // Fetch all users who have coins > 0 (regardless of purchases)
  const result = await pool.query<{
    telegram_id: string;
    coins: number;
    last_mining_at: Date | null;
  }>(
    `SELECT telegram_id, coins, last_mining_at
     FROM gm_users
     WHERE coins > 0`,
  );

  if (!result.rows.length) return;

  const now = new Date();
  let credited = 0;

  for (const user of result.rows) {
    const lastMining = user.last_mining_at ? new Date(user.last_mining_at) : null;
    const elapsedMs = lastMining ? now.getTime() - lastMining.getTime() : MS_PER_DAY;

    if (elapsedMs < 60_000) continue; // less than 1 minute — skip

    // Cap at 7 days unclaimed to prevent abuse on very old accounts
    const fraction = Math.min(elapsedMs / MS_PER_DAY, 7);

    // Daily Reward = coins × 5% / coins_per_gram (in gram)
    const earned =
      Math.round((user.coins * 0.05 / coinsPerGram) * fraction * 1_000_000) /
      1_000_000;

    if (earned <= 0) continue;

    try {
      await pool.query(
        `UPDATE gm_users
         SET balance        = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision,
             last_mining_at = $2
         WHERE telegram_id = $3`,
        [earned, now, user.telegram_id],
      );

      await pool.query(
        `INSERT INTO gm_earnings_log (telegram_id, amount) VALUES ($1, $2)`,
        [user.telegram_id, earned],
      ).catch(() => {});

      credited++;
    } catch (err) {
      logger.error({ err, telegramId: user.telegram_id }, "miningSettler: failed to credit user");
    }
  }

  if (credited > 0) {
    logger.info(
      { users: credited, coinsPerGram, total: result.rows.length },
      "Mining cycle: credited users",
    );
  }
}

export function startMiningSettler() {
  // Run once after 1 minute (let DB settle), then every 30 minutes
  setTimeout(async () => {
    await runMiningCycle().catch(err =>
      logger.error({ err }, "Mining settler initial run failed"),
    );
    setInterval(async () => {
      await runMiningCycle().catch(err =>
        logger.error({ err }, "Mining settler interval failed"),
      );
    }, 30 * 60 * 1000);
  }, 60_000);

  logger.info("Mining settler started (30-min interval)");
}
