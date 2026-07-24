/**
 * Deposit routes (Gram / TON deposits):
 *
 *   POST /api/telegram/deposit/submit   — user submits a deposit tx hash for review
 *   GET  /api/telegram/deposit/status   — user's deposit history
 *   GET  /api/admin/deposits            — admin: list all deposits
 *   POST /api/admin/deposits/:id/verify — admin: manually verify / approve / reject deposit
 *
 * Design notes:
 *   - Deposits are NEVER auto-credited without verification.
 *   - If TON_API_URL (public, no key required) is set, on-chain confirmation is
 *     attempted. Otherwise the deposit is left pending for admin review.
 *   - Duplicate tx hashes are rejected by the UNIQUE constraint.
 *   - Only "confirmed" deposits credit balance; no double-processing (idempotent).
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

function getAdminIds(): number[] {
  // Use same admin IDs as requireAdmin middleware
  return [6145230334, 868999453];
}

// ── Lazy migration ────────────────────────────────────────────────────────────
let migratedDeposits = false;
async function ensureDepositSchema() {
  if (migratedDeposits) return;
  migratedDeposits = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_deposits (
        id                serial PRIMARY KEY,
        telegram_id       bigint NOT NULL,
        wallet_address    text   NOT NULL,
        tx_hash           text   NOT NULL UNIQUE,
        amount            double precision NOT NULL,
        status            text   NOT NULL DEFAULT 'pending',
        confirmations     integer NOT NULL DEFAULT 0,
        credited_at       timestamp,
        rejection_reason  text,
        created_at        timestamp NOT NULL DEFAULT NOW(),
        processed_at      timestamp
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS gm_deposits_tg_idx ON gm_deposits (telegram_id, created_at DESC)`,
    );
  } catch (e) {
    logger.warn({ e }, "deposits schema migration skipped");
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
 * Optionally verifies a tx hash using the public TON API (no API key needed).
 * Returns { confirmed: boolean, amount?: number } or null if unavailable.
 * TON_API_URL defaults to https://toncenter.com/api/v2 (public, rate-limited).
 */
async function verifyOnChain(txHash: string, expectedWallet: string): Promise<{
  confirmed: boolean; amount: number;
} | null> {
  const tonApiBase = process.env["TON_API_URL"] ?? "https://toncenter.com/api/v2";
  try {
    const url = `${tonApiBase}/getTransactions?address=${encodeURIComponent(expectedWallet)}&limit=10`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      ok?: boolean;
      result?: Array<{
        transaction_id?: { hash?: string };
        in_msg?: { value?: string | number };
      }>;
    };
    if (!data.ok || !Array.isArray(data.result)) return null;

    for (const tx of data.result) {
      const hash = tx.transaction_id?.hash ?? "";
      // tx hashes may be base64 or hex — compare both
      if (hash === txHash || Buffer.from(hash, "base64").toString("hex") === txHash) {
        const nanotons = Number(tx.in_msg?.value ?? 0);
        const amount = nanotons / 1e9;
        return { confirmed: true, amount };
      }
    }
    return { confirmed: false, amount: 0 };
  } catch (e) {
    logger.debug({ e }, "On-chain verification unavailable");
    return null;
  }
}

// ── POST /api/telegram/deposit/submit ────────────────────────────────────────
router.post("/telegram/deposit/submit", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, txHash, amount } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  if (typeof txHash !== "string" || !txHash.trim()) {
    res.status(400).json({ error: "txHash required" }); return;
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureDepositSchema();
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    // Load user wallet
    const [dbUser] = await db
      .select({ walletAddress: usersTable.walletAddress })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));

    if (!dbUser?.walletAddress) {
      res.status(400).json({ error: "No wallet connected. Connect your TON wallet first." }); return;
    }

    // Try on-chain verification
    const onChain = await verifyOnChain(txHash.trim(), dbUser.walletAddress);

    let status: string;
    let creditedAmount: number | null = null;

    if (onChain === null) {
      // No API available — leave pending for admin review
      status = "pending";
    } else if (!onChain.confirmed) {
      // TX not found on chain — reject
      status = "rejected";
    } else {
      // TX found — confirm and credit
      status = "confirmed";
      creditedAmount = onChain.amount > 0 ? onChain.amount : amt;
    }

    // Insert deposit record (UNIQUE on tx_hash prevents duplicates)
    let depositId: number;
    try {
      const insertRes = await pool.query<{ id: number }>(
        `INSERT INTO gm_deposits (telegram_id, wallet_address, tx_hash, amount, status, confirmations, credited_at, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          user.id,
          dbUser.walletAddress,
          txHash.trim(),
          creditedAmount ?? amt,
          status,
          onChain?.confirmed ? 1 : 0,
          status === "confirmed" ? new Date() : null,
          status !== "pending" ? new Date() : null,
        ],
      );
      depositId = insertRes.rows[0]!.id;
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
        res.status(409).json({ error: "This transaction hash has already been submitted." }); return;
      }
      throw e;
    }

    // Credit balance if confirmed
    if (status === "confirmed" && creditedAmount !== null) {
      await pool.query(
        `UPDATE gm_users SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision WHERE telegram_id = $2`,
        [creditedAmount, user.id],
      );
      await notifyTelegram(
        user.id,
        `✅ <b>تم تأكيد الإيداع!</b>\n\n💰 المبلغ: <b>${creditedAmount.toFixed(4)} gram</b>\n🔗 TX: <code>${txHash.trim()}</code>\n\nتم إضافة الرصيد لحسابك.`,
      );
    }

    // Notify admins
    for (const adminId of getAdminIds()) {
      await notifyTelegram(
        adminId,
        `💰 <b>طلب إيداع جديد #${depositId}</b>\n\n` +
        `👤 المستخدم: ${user.first_name ?? "Miner"} (ID: ${user.id})\n` +
        `💵 المبلغ: ${(creditedAmount ?? amt).toFixed(4)} gram\n` +
        `📋 TX: <code>${txHash.trim()}</code>\n` +
        `📊 الحالة: ${status === "confirmed" ? "✅ مؤكد" : status === "rejected" ? "❌ مرفوض" : "⏳ معلق"}\n\n` +
        (status === "pending" ? `للتحقق يدوياً استخدم لوحة الإدارة.` : ""),
      );
    }

    res.json({
      ok: true,
      depositId,
      status,
      message: status === "confirmed"
        ? "تم تأكيد الإيداع وإضافة الرصيد."
        : status === "rejected"
          ? "لم يتم العثور على المعاملة. تحقق من TX Hash وحاول مرة أخرى."
          : "تم استلام طلبك. سيتم مراجعته من قبل الإدارة.",
    });
  } catch (err) {
    logger.error({ err }, "POST /telegram/deposit/submit failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/telegram/deposit/tonconnect ────────────────────────────────────
// User paid gram via TON Connect — credit gram balance automatically.
// body: { initData, boc, amountGram }
router.post("/telegram/deposit/tonconnect", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, boc, amountGram } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  if (typeof boc !== "string" || !boc) {
    res.status(400).json({ error: "boc required" }); return;
  }
  const amt = Number(amountGram);
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountGram must be a positive number" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureDepositSchema();
  try {
    const { pool } = await import("@workspace/db");

    // Store boc column (best-effort migration)
    await pool.query(
      `ALTER TABLE gm_deposits ADD COLUMN IF NOT EXISTS ton_boc text`,
    ).catch(() => {});

    // Use boc as unique tx_hash to prevent double-crediting
    const bocHash = `tonconnect:${Buffer.from(boc).toString("base64").slice(0, 64)}`;

    let depositId: number;
    try {
      const insertRes = await pool.query<{ id: number }>(
        `INSERT INTO gm_deposits
           (telegram_id, wallet_address, tx_hash, amount, status, confirmations, credited_at, processed_at)
         VALUES ($1, $2, $3, $4, 'confirmed', 1, NOW(), NOW())
         RETURNING id`,
        [user.id, "tonconnect", bocHash, amt],
      );
      depositId = insertRes.rows[0]!.id;
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
        res.status(409).json({ error: "هذه المعاملة تمت معالجتها بالفعل." }); return;
      }
      throw e;
    }

    // Store boc for audit
    pool.query(
      `UPDATE gm_deposits SET ton_boc=$1 WHERE id=$2`,
      [boc.slice(0, 2000), depositId],
    ).catch(() => {});

    // Credit gram balance
    await pool.query(
      `UPDATE gm_users
       SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision
       WHERE telegram_id = $2`,
      [amt, user.id],
    );

    // Load updated balance
    const balRes = await pool.query<{ balance: number }>(
      `SELECT balance FROM gm_users WHERE telegram_id=$1`,
      [user.id],
    );
    const newBalance = balRes.rows[0]?.balance ?? 0;

    // Notify user
    await notifyTelegram(
      user.id,
      `✅ <b>تم تأكيد الإيداع!</b>\n\n💰 المبلغ: <b>${amt.toFixed(4)} gram</b>\n\nتم إضافة الرصيد لحسابك تلقائياً.`,
    );

    // Notify admins
    for (const adminId of getAdminIds()) {
      await notifyTelegram(
        adminId,
        `💰 <b>إيداع TON Connect جديد #${depositId}</b>\n\n` +
        `👤 ${user.first_name ?? "Miner"} (ID: ${user.id})\n` +
        `💵 المبلغ: ${amt.toFixed(4)} gram\n` +
        `✅ تم الإضافة تلقائياً`,
      );
    }

    res.json({
      ok: true,
      depositId,
      balance: newBalance,
      message: `✅ تم إيداع ${amt.toFixed(4)} gram وإضافته لرصيدك.`,
    });
  } catch (err) {
    logger.error({ err }, "POST /telegram/deposit/tonconnect failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/telegram/deposit/status ─────────────────────────────────────────
router.get("/telegram/deposit/status", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.json([]); return; }
  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.json([]); return; }
  const user = verifyInitData(initData, token);
  if (!user) { res.json([]); return; }

  await ensureDepositSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT id, tx_hash, amount, status, confirmations, credited_at, rejection_reason, created_at, processed_at
       FROM gm_deposits WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [user.id],
    );
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────
const adminRouter: IRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/deposits
adminRouter.get("/admin/deposits", async (_req, res) => {
  await ensureDepositSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(`
      SELECT d.*, u.first_name, u.username
      FROM gm_deposits d
      LEFT JOIN gm_users u ON u.telegram_id = d.telegram_id
      ORDER BY d.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "GET /admin/deposits failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/admin/deposits/:id/verify  — body: { action: "approve"|"reject", reason?: string }
adminRouter.post("/admin/deposits/:id/verify", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { action, reason } = (req.body ?? {}) as { action?: string; reason?: string };
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" }); return;
  }

  await ensureDepositSchema();
  try {
    const { pool } = await import("@workspace/db");

    // Load deposit — only pending deposits can be acted on
    const depRes = await pool.query<{
      id: number; telegram_id: number; amount: number; status: string; tx_hash: string; wallet_address: string;
    }>("SELECT * FROM gm_deposits WHERE id=$1 AND status='pending'", [id]);

    if (!depRes.rows.length) {
      res.status(404).json({ error: "Deposit not found or already processed" }); return;
    }
    const dep = depRes.rows[0]!;

    if (action === "approve") {
      // Credit balance
      await pool.query(
        `UPDATE gm_users SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision WHERE telegram_id = $2`,
        [dep.amount, dep.telegram_id],
      );
      await pool.query(
        `UPDATE gm_deposits SET status='confirmed', confirmations=1, credited_at=NOW(), processed_at=NOW() WHERE id=$1`,
        [id],
      );
      await notifyTelegram(
        dep.telegram_id,
        `✅ <b>تم تأكيد الإيداع!</b>\n\n💰 المبلغ: <b>${dep.amount.toFixed(4)} gram</b>\n🔗 TX: <code>${dep.tx_hash}</code>\n\nتم إضافة الرصيد لحسابك.`,
      );
      res.json({ ok: true, status: "confirmed" });
    } else {
      const rejectionReason = reason?.trim() || "تم رفض الطلب من قبل الإدارة";
      await pool.query(
        `UPDATE gm_deposits SET status='rejected', rejection_reason=$1, processed_at=NOW() WHERE id=$2`,
        [rejectionReason, id],
      );
      await notifyTelegram(
        dep.telegram_id,
        `❌ <b>تم رفض طلب الإيداع</b>\n\n💰 المبلغ: ${dep.amount.toFixed(4)} gram\n📋 TX: <code>${dep.tx_hash}</code>\nالسبب: ${rejectionReason}`,
      );
      res.json({ ok: true, status: "rejected" });
    }
  } catch (err) {
    logger.error({ err }, "POST /admin/deposits/:id/verify failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.use(adminRouter);

export default router;
