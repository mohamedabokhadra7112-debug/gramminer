/**
 * Coin Store routes:
 *
 *   GET  /api/store/products            — list enabled products (public-ish, initData auth)
 *   POST /api/store/purchase            — authenticated: purchase a product with coins
 *   GET  /api/store/purchases           — authenticated: user's purchase history / ownership
 *   POST /api/telegram/mining/claim     — authenticated: claim mining income from store purchases
 *   GET  /api/telegram/mining/status    — authenticated: mining status from purchases
 *
 *   GET    /api/admin/store/products        — admin: list all products
 *   POST   /api/admin/store/products        — admin: create product
 *   PATCH  /api/admin/store/products/:id    — admin: update product
 *   DELETE /api/admin/store/products/:id    — admin: delete product
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
let migratedStore = false;
async function ensureStoreSchema() {
  if (migratedStore) return;
  migratedStore = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_store_products (
        id                serial PRIMARY KEY,
        name              text   NOT NULL,
        description       text   NOT NULL DEFAULT '',
        coin_price        integer NOT NULL,
        gram_value        double precision NOT NULL DEFAULT 0,
        daily_mining_pct  double precision NOT NULL DEFAULT 0.05,
        is_enabled        boolean NOT NULL DEFAULT true,
        created_at        timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_store_purchases (
        id                   serial PRIMARY KEY,
        telegram_id          bigint NOT NULL,
        product_id           integer NOT NULL,
        coins_paid           integer NOT NULL,
        gram_value           double precision NOT NULL DEFAULT 0,
        daily_mining_pct     double precision NOT NULL DEFAULT 0.05,
        principal_remaining  double precision NOT NULL DEFAULT 0,
        last_claim_at        timestamp,
        purchased_at         timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS gm_store_purchases_tg_idx ON gm_store_purchases (telegram_id)`,
    );
  } catch (e) {
    logger.warn({ e }, "store schema migration skipped");
  }
}

// ── GET /api/store/products ───────────────────────────────────────────────────
router.get("/store/products", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.status(400).json({ error: "x-init-data required" }); return; }
  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT id, name, description, coin_price, gram_value, daily_mining_pct, is_enabled, created_at
       FROM gm_store_products WHERE is_enabled=true ORDER BY coin_price`,
    );
    res.json(result.rows.map((r: Record<string, unknown>) => ({
      id: r["id"],
      name: r["name"],
      description: r["description"],
      coinPrice: r["coin_price"],
      gramValue: r["gram_value"],
      dailyMiningPct: r["daily_mining_pct"],
      isEnabled: r["is_enabled"],
      createdAt: r["created_at"],
    })));
  } catch (err) {
    logger.error({ err }, "GET /store/products failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/store/purchase ──────────────────────────────────────────────────
router.post("/store/purchase", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, productId } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  const pid = Number(productId);
  if (!Number.isInteger(pid) || pid <= 0) {
    res.status(400).json({ error: "productId must be a positive integer" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureStoreSchema();
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    // Load product
    const prodRes = await pool.query<{
      id: number; name: string; coin_price: number; gram_value: number;
      daily_mining_pct: number; is_enabled: boolean;
    }>("SELECT * FROM gm_store_products WHERE id=$1", [pid]);

    if (!prodRes.rows.length || !prodRes.rows[0]!.is_enabled) {
      res.status(404).json({ error: "Product not found or not available" }); return;
    }
    const product = prodRes.rows[0]!;

    // Load user coins
    const [dbUser] = await db
      .select({ coins: usersTable.coins })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));

    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }
    if ((dbUser.coins ?? 0) < product.coin_price) {
      res.status(400).json({ error: "Insufficient coin balance", required: product.coin_price, current: dbUser.coins }); return;
    }

    // Atomic: deduct coins
    const [updated] = await db
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} - ${product.coin_price}` })
      .where(eq(usersTable.telegramId, user.id))
      .returning({ coins: usersTable.coins });

    // Create purchase/ownership record
    const purchaseRes = await pool.query<{ id: number }>(
      `INSERT INTO gm_store_purchases
         (telegram_id, product_id, coins_paid, gram_value, daily_mining_pct, principal_remaining)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [user.id, product.id, product.coin_price, product.gram_value, product.daily_mining_pct, product.gram_value],
    );

    res.json({
      ok: true,
      purchaseId: purchaseRes.rows[0]?.id,
      product: {
        id: product.id,
        name: product.name,
        gramValue: product.gram_value,
        dailyMiningPct: product.daily_mining_pct,
      },
      coinsSpent: product.coin_price,
      coinsRemaining: updated?.coins ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "POST /store/purchase failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/store/purchases ──────────────────────────────────────────────────
router.get("/store/purchases", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.json([]); return; }
  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.json([]); return; }
  const user = verifyInitData(initData, token);
  if (!user) { res.json([]); return; }

  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT sp.id, sp.product_id, sp.coins_paid, sp.gram_value, sp.daily_mining_pct,
              sp.principal_remaining, sp.last_claim_at, sp.purchased_at,
              p.name AS product_name
       FROM gm_store_purchases sp
       LEFT JOIN gm_store_products p ON p.id = sp.product_id
       WHERE sp.telegram_id=$1
       ORDER BY sp.purchased_at DESC`,
      [user.id],
    );
    res.json(result.rows.map((r: Record<string, unknown>) => ({
      id: r["id"],
      productId: r["product_id"],
      productName: r["product_name"],
      coinsPaid: r["coins_paid"],
      gramValue: r["gram_value"],
      dailyMiningPct: r["daily_mining_pct"],
      principalRemaining: r["principal_remaining"],
      lastClaimAt: r["last_claim_at"],
      purchasedAt: r["purchased_at"],
    })));
  } catch {
    res.json([]);
  }
});

// ── POST /api/telegram/mining/claim (store-based) ─────────────────────────────
// Calculates and credits 5% daily income per 24h from active store purchases.
// Mining only earns while principalRemaining > 0.
router.post("/telegram/mining/claim", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureStoreSchema();
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    const now = new Date();

    // Load active purchases (principal > 0)
    const purchasesRes = await pool.query<{
      id: number; gram_value: number; daily_mining_pct: number;
      principal_remaining: number; last_claim_at: Date | null;
    }>(
      `SELECT id, gram_value, daily_mining_pct, principal_remaining, last_claim_at
       FROM gm_store_purchases
       WHERE telegram_id=$1 AND principal_remaining > 0`,
      [user.id],
    );

    if (!purchasesRes.rows.length) {
      res.json({ ok: true, claimed: 0, message: "No active mining purchases" });
      return;
    }

    let totalClaimed = 0;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    for (const purchase of purchasesRes.rows) {
      const lastClaim = purchase.last_claim_at ? new Date(purchase.last_claim_at) : null;
      const elapsedMs = lastClaim ? now.getTime() - lastClaim.getTime() : MS_PER_DAY;
      if (elapsedMs < 0) continue; // clock skew guard

      // Pro-rate: dailyPct * (elapsed / 24h) * principal
      const dailyPct = purchase.daily_mining_pct;
      const principal = purchase.principal_remaining;
      const fraction = Math.min(elapsedMs / MS_PER_DAY, 7); // cap at 7 days unclaimed
      const earned = Math.round(dailyPct * principal * fraction * 1_000_000) / 1_000_000;

      if (earned <= 0) continue;

      totalClaimed += earned;

      // Update last_claim_at; note: principal doesn't decrease (income only model)
      // If you want principal to decrease (principal-consuming model), uncomment below
      await pool.query(
        `UPDATE gm_store_purchases SET last_claim_at=$1 WHERE id=$2`,
        [now, purchase.id],
      );
    }

    if (totalClaimed <= 0) {
      res.json({ ok: true, claimed: 0, message: "Nothing to claim yet" });
      return;
    }

    // Credit balance
    const [updated] = await db
      .update(usersTable)
      .set({
        balance: sql`ROUND(CAST(${usersTable.balance} AS numeric) + CAST(${totalClaimed} AS numeric), 6)::double precision`,
        lastActiveAt: now,
      })
      .where(eq(usersTable.telegramId, user.id))
      .returning({ balance: usersTable.balance });

    // Log to earnings log (fire-and-forget)
    pool.query(
      "INSERT INTO gm_earnings_log (telegram_id, amount) VALUES ($1,$2)",
      [user.id, totalClaimed],
    ).catch(() => {});

    res.json({
      ok: true,
      claimed: totalClaimed,
      balance: updated?.balance ?? totalClaimed,
    });
  } catch (err) {
    logger.error({ err }, "POST /telegram/mining/claim failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/telegram/mining/status ──────────────────────────────────────────
router.get("/telegram/mining/status", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.json({ active: false, dailyIncome: 0, purchases: [] }); return; }
  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.json({ active: false, dailyIncome: 0, purchases: [] }); return; }
  const user = verifyInitData(initData, token);
  if (!user) { res.json({ active: false, dailyIncome: 0, purchases: [] }); return; }

  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{
      id: number; product_name: string | null; gram_value: number;
      daily_mining_pct: number; principal_remaining: number; last_claim_at: Date | null;
    }>(
      `SELECT sp.id, p.name AS product_name, sp.gram_value, sp.daily_mining_pct,
              sp.principal_remaining, sp.last_claim_at
       FROM gm_store_purchases sp
       LEFT JOIN gm_store_products p ON p.id = sp.product_id
       WHERE sp.telegram_id=$1 AND sp.principal_remaining > 0`,
      [user.id],
    );

    const purchases = result.rows;
    const dailyIncome = purchases.reduce(
      (sum, p) => sum + p.daily_mining_pct * p.principal_remaining,
      0,
    );

    res.json({
      active: purchases.length > 0,
      dailyIncome: Math.round(dailyIncome * 1_000_000) / 1_000_000,
      purchases: purchases.map(p => ({
        id: p.id,
        productName: p.product_name,
        gramValue: p.gram_value,
        dailyMiningPct: p.daily_mining_pct,
        principalRemaining: p.principal_remaining,
        lastClaimAt: p.last_claim_at,
        dailyIncome: Math.round(p.daily_mining_pct * p.principal_remaining * 1_000_000) / 1_000_000,
      })),
    });
  } catch {
    res.json({ active: false, dailyIncome: 0, purchases: [] });
  }
});

// ── Admin store product CRUD ──────────────────────────────────────────────────
const adminRouter: IRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/store/products
adminRouter.get("/admin/store/products", async (_req, res) => {
  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT id, name, description, coin_price, gram_value, daily_mining_pct, is_enabled, created_at
       FROM gm_store_products ORDER BY coin_price`,
    );
    res.json(result.rows.map((r: Record<string, unknown>) => ({
      id: r["id"],
      name: r["name"],
      description: r["description"],
      coinPrice: r["coin_price"],
      gramValue: r["gram_value"],
      dailyMiningPct: r["daily_mining_pct"],
      isEnabled: r["is_enabled"],
      createdAt: r["created_at"],
    })));
  } catch (err) {
    logger.error({ err }, "GET /admin/store/products failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/admin/store/products
adminRouter.post("/admin/store/products", async (req, res): Promise<void> => {
  const { name, description, coinPrice, gramValue, dailyMiningPct, isEnabled = true } =
    (req.body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name required" }); return;
  }
  const cp = Number(coinPrice);
  if (!Number.isInteger(cp) || cp <= 0) {
    res.status(400).json({ error: "coinPrice must be a positive integer" }); return;
  }
  const gv = Number(gramValue);
  if (!Number.isFinite(gv) || gv < 0) {
    res.status(400).json({ error: "gramValue must be non-negative" }); return;
  }
  const dmp = Number(dailyMiningPct);
  if (!Number.isFinite(dmp) || dmp < 0 || dmp > 1) {
    res.status(400).json({ error: "dailyMiningPct must be between 0 and 1 (e.g., 0.05 for 5%)" }); return;
  }

  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ id: number }>(
      `INSERT INTO gm_store_products (name, description, coin_price, gram_value, daily_mining_pct, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name.trim(), String(description ?? ""), cp, gv, dmp, Boolean(isEnabled)],
    );
    res.json({ ok: true, id: result.rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "POST /admin/store/products failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// PATCH /api/admin/store/products/:id
adminRouter.patch("/admin/store/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updates: string[] = [];
  const params: unknown[] = [];
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.name !== undefined) {
    params.push(String(body.name)); updates.push(`name=$${params.length}`);
  }
  if (body.description !== undefined) {
    params.push(String(body.description)); updates.push(`description=$${params.length}`);
  }
  if (body.coinPrice !== undefined) {
    const v = Number(body.coinPrice);
    if (!Number.isInteger(v) || v <= 0) { res.status(400).json({ error: "Invalid coinPrice" }); return; }
    params.push(v); updates.push(`coin_price=$${params.length}`);
  }
  if (body.gramValue !== undefined) {
    const v = Number(body.gramValue);
    if (!Number.isFinite(v) || v < 0) { res.status(400).json({ error: "Invalid gramValue" }); return; }
    params.push(v); updates.push(`gram_value=$${params.length}`);
  }
  if (body.dailyMiningPct !== undefined) {
    const v = Number(body.dailyMiningPct);
    if (!Number.isFinite(v) || v < 0 || v > 1) { res.status(400).json({ error: "Invalid dailyMiningPct" }); return; }
    params.push(v); updates.push(`daily_mining_pct=$${params.length}`);
  }
  if (body.isEnabled !== undefined) {
    params.push(Boolean(body.isEnabled)); updates.push(`is_enabled=$${params.length}`);
  }

  if (updates.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    params.push(id);
    await pool.query(
      `UPDATE gm_store_products SET ${updates.join(", ")} WHERE id=$${params.length}`,
      params,
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PATCH /admin/store/products failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/admin/store/products/:id
adminRouter.delete("/admin/store/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await ensureStoreSchema();
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("DELETE FROM gm_store_products WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /admin/store/products failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.use(adminRouter);

export default router;
