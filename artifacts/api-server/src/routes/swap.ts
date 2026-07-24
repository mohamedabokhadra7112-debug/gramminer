/**
 * Swap routes (Gram <-> Coins):
 *
 *   POST /api/telegram/swap           — authenticated: swap gram↔coins atomically
 *   GET  /api/telegram/swap/history   — authenticated: swap history
 *   GET  /api/admin/swap/rate         — admin: get current rate
 *   POST /api/admin/swap/rate         — admin: set exchange rate
 *
 * Exchange rate is stored in gm_settings as "swap_rate_gram_per_coin" (gram per 1 coin).
 * Default: 0.001 gram per coin (1000 coins = 1 gram).
 */

import { Router, type IRouter } from "express";
import { verifyInitData } from "../lib/telegramAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const DEFAULT_RATE = 0.001; // gram per 1 coin
const RATE_SETTING_KEY = "swap_rate_gram_per_coin";

// ── Lazy migration ────────────────────────────────────────────────────────────
let migratedSwap = false;
async function ensureSwapSchema() {
  if (migratedSwap) return;
  migratedSwap = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_swaps (
        id          serial PRIMARY KEY,
        telegram_id bigint NOT NULL,
        direction   text   NOT NULL,
        gram_amount double precision NOT NULL,
        coins_amount integer NOT NULL,
        rate        double precision NOT NULL,
        created_at  timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS gm_swaps_tg_idx ON gm_swaps (telegram_id, created_at DESC)`,
    );
  } catch (e) {
    logger.warn({ e }, "swap schema migration skipped");
  }
}

async function getSwapRate(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return DEFAULT_RATE;
    const { settingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, RATE_SETTING_KEY));
    return row?.value ? Number(row.value) || DEFAULT_RATE : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

// ── POST /api/telegram/swap ───────────────────────────────────────────────────
router.post("/telegram/swap", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, direction, amount } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  if (direction !== "gram_to_coins" && direction !== "coins_to_gram") {
    res.status(400).json({ error: "direction must be 'gram_to_coins' or 'coins_to_gram'" }); return;
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amount must be positive" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureSwapSchema();
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    const rate = await getSwapRate();

    // Load current balances
    const [dbUser] = await db
      .select({ balance: usersTable.balance, coins: usersTable.coins })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));

    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    let gramAmount: number;
    let coinsAmount: number;

    if (direction === "gram_to_coins") {
      gramAmount = Math.round(amt * 1_000_000) / 1_000_000;
      coinsAmount = Math.floor(gramAmount / rate);
      if (coinsAmount <= 0) {
        res.status(400).json({ error: `Too small. Minimum swap produces at least 1 coin. Rate: ${rate} gram/coin` }); return;
      }
      if ((dbUser.balance ?? 0) < gramAmount) {
        res.status(400).json({ error: "Insufficient gram balance" }); return;
      }
      // Atomic: deduct gram, add coins
      await db.update(usersTable).set({
        balance: sql`ROUND(CAST(${usersTable.balance} AS numeric) - CAST(${gramAmount} AS numeric), 6)::double precision`,
        coins: sql`${usersTable.coins} + ${coinsAmount}`,
      }).where(eq(usersTable.telegramId, user.id));
    } else {
      // coins_to_gram: amount is in coins
      coinsAmount = Math.floor(amt);
      if (coinsAmount <= 0) {
        res.status(400).json({ error: "coinsAmount must be at least 1" }); return;
      }
      if ((dbUser.coins ?? 0) < coinsAmount) {
        res.status(400).json({ error: "Insufficient coin balance" }); return;
      }
      gramAmount = Math.round(coinsAmount * rate * 1_000_000) / 1_000_000;
      // Atomic: deduct coins, add gram
      await db.update(usersTable).set({
        coins: sql`${usersTable.coins} - ${coinsAmount}`,
        balance: sql`ROUND(CAST(${usersTable.balance} AS numeric) + CAST(${gramAmount} AS numeric), 6)::double precision`,
      }).where(eq(usersTable.telegramId, user.id));
    }

    // Record swap
    await pool.query(
      `INSERT INTO gm_swaps (telegram_id, direction, gram_amount, coins_amount, rate) VALUES ($1,$2,$3,$4,$5)`,
      [user.id, direction, gramAmount, coinsAmount, rate],
    );

    // Return updated balances
    const [updated] = await db
      .select({ balance: usersTable.balance, coins: usersTable.coins })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));

    res.json({
      ok: true,
      direction,
      gramAmount,
      coinsAmount,
      rate,
      balance: updated?.balance ?? 0,
      coins: updated?.coins ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "POST /telegram/swap failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/telegram/swap/history ───────────────────────────────────────────
router.get("/telegram/swap/history", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.json([]); return; }
  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.json([]); return; }
  const user = verifyInitData(initData, token);
  if (!user) { res.json([]); return; }

  await ensureSwapSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT id, direction, gram_amount, coins_amount, rate, created_at
       FROM gm_swaps WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    );
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

// ── Admin swap rate endpoints ─────────────────────────────────────────────────
const adminRouter: IRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/admin/swap/rate", async (_req, res) => {
  try {
    const rate = await getSwapRate();
    res.json({ rate, rateKey: RATE_SETTING_KEY, description: "gram per 1 coin" });
  } catch (err) {
    logger.error({ err }, "GET /admin/swap/rate failed");
    res.status(500).json({ error: "Internal error" });
  }
});

adminRouter.post("/admin/swap/rate", async (req, res): Promise<void> => {
  const { rate } = (req.body ?? {}) as { rate?: unknown };
  const v = Number(rate);
  if (!Number.isFinite(v) || v <= 0) {
    res.status(400).json({ error: "rate must be a positive number (gram per 1 coin)" }); return;
  }
  try {
    const db = await getDb();
    if (!db) { res.status(503).json({ error: "DB not available" }); return; }
    const { settingsTable } = await import("@workspace/db");
    await db.insert(settingsTable).values({ key: RATE_SETTING_KEY, value: String(v) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(v) } });
    res.json({ ok: true, rate: v });
  } catch (err) {
    logger.error({ err }, "POST /admin/swap/rate failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.use(adminRouter);

export default router;
