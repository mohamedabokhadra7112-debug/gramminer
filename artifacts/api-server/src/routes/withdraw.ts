/**
 * Withdrawal routes:
 *   POST /api/telegram/withdraw          — user requests withdrawal
 *   GET  /api/admin/withdrawals          — admin lists all requests
 *   POST /api/admin/withdrawals/:id/approve — admin approves + sends TON
 *   POST /api/admin/withdrawals/:id/reject  — admin rejects + refunds balance
 *
 * Env vars:
 *   OWNER_SECRET_KEY  — JSON array of numbers (tonweb SecretKey)
 *   OWNER_PUBLIC_KEY  — JSON array of numbers (tonweb PublicKey)
 *   BOT_TOKEN / TELEGRAM_BOT_TOKEN
 *   ADMIN_ID
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

function getAdminId() {
  return Number(process.env["ADMIN_ID"] ?? 0);
}

// ── Lazy DB migration ─────────────────────────────────────────────────────────
let migrated = false;
async function ensureSchema() {
  if (migrated) return;
  migrated = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_withdrawals (
        id               serial PRIMARY KEY,
        telegram_id      bigint NOT NULL,
        wallet_address   text   NOT NULL,
        amount           double precision NOT NULL,
        status           text   NOT NULL DEFAULT 'pending',
        tx_hash          text,
        rejection_reason text,
        created_at       timestamp NOT NULL DEFAULT NOW(),
        processed_at     timestamp
      )
    `);
    await pool.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS referred_by bigint`);
    await pool.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0`);
  } catch (e) {
    logger.warn({ e }, "withdraw schema migration skipped");
  }
}

// ── TON sender ────────────────────────────────────────────────────────────────
async function sendTon(toAddress: string, amountTon: number): Promise<string | null> {
  try {
    // Dynamically import tonweb (CommonJS lib)
    const TonWeb = (await import("tonweb")).default ?? (await import("tonweb"));

    const secretKeyEnv = process.env["OWNER_SECRET_KEY"];
    const publicKeyEnv = process.env["OWNER_PUBLIC_KEY"];
    if (!secretKeyEnv || !publicKeyEnv) {
      logger.error("OWNER_SECRET_KEY / OWNER_PUBLIC_KEY not set — cannot send TON");
      return null;
    }

    const SecretKey = Uint8Array.from(JSON.parse(secretKeyEnv) as number[]);
    const PublicKey = Uint8Array.from(JSON.parse(publicKeyEnv) as number[]);

    const tonweb = new TonWeb();
    const wallet = tonweb.wallet.create({ publicKey: PublicKey });

    const seqno = await (wallet as any).methods.seqno().call();
    const transfer = (wallet as any).methods.transfer({
      secretKey: SecretKey,
      toAddress,
      amount: TonWeb.utils.toNano(String(amountTon)),
      seqno: seqno ?? 0,
      payload: "GramMiner Withdrawal",
      sendMode: 3,
    });
    const result = await transfer.send();
    const txHash = (result as any)?.transaction?.id?.hash ?? null;
    return txHash ? String(txHash) : "sent";
  } catch (err) {
    logger.error({ err }, "TON send failed");
    return null;
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

// ── POST /api/telegram/withdraw ───────────────────────────────────────────────
router.post("/telegram/withdraw", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, amount } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "Invalid amount" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureSchema();
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    // Load user balance + wallet
    const [dbUser] = await db
      .select({ balance: usersTable.balance, walletAddress: usersTable.walletAddress, restrictWithdrawal: usersTable.restrictWithdrawal })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));

    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }
    if (dbUser.restrictWithdrawal) { res.status(403).json({ error: "Withdrawal restricted for this account" }); return; }
    if (!dbUser.walletAddress) { res.status(400).json({ error: "No wallet connected. Connect your TON wallet first." }); return; }
    if ((dbUser.balance ?? 0) < amt) { res.status(400).json({ error: "Insufficient balance" }); return; }

    // Enforce withdrawal limits (min 0.1 gram hardcoded floor; admin can raise it)
    if (amt < 0.1) {
      res.status(400).json({ error: "الحد الأدنى للسحب هو 0.1 gram" }); return;
    }
    try {
      const { settingsTable } = await import("@workspace/db");
      for (const key of ["min_withdrawal", "max_withdrawal"]) {
        const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
        if (row?.value) {
          const limit = Number(row.value);
          if (key === "min_withdrawal" && amt < limit) {
            res.status(400).json({ error: `الحد الأدنى للسحب هو ${limit} gram` }); return;
          }
          if (key === "max_withdrawal" && amt > limit) {
            res.status(400).json({ error: `الحد الأقصى للسحب هو ${limit} gram` }); return;
          }
        }
      }
    } catch { /* if settings unavailable, skip limit check */ }

    // Deduct balance immediately (held in escrow)
    await db
      .update(usersTable)
      .set({ balance: (dbUser.balance ?? 0) - amt })
      .where(eq(usersTable.telegramId, user.id));

    // Create withdrawal record
    const insertResult = await pool.query(
      `INSERT INTO gm_withdrawals (telegram_id, wallet_address, amount) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, dbUser.walletAddress, amt],
    );
    const withdrawalId: number = insertResult.rows[0].id;

    // Notify admin
    const adminId = getAdminId();
    if (adminId) {
      const firstName = user.first_name ?? "Miner";
      const username = user.username ? `@${user.username}` : `ID: ${user.id}`;
      await notifyTelegram(
        adminId,
        `💸 <b>طلب سحب جديد #${withdrawalId}</b>\n\n` +
        `👤 المستخدم: ${firstName} (${username})\n` +
        `💰 المبلغ: ${amt.toFixed(4)} gram\n` +
        `📍 المحفظة: <code>${dbUser.walletAddress}</code>\n\n` +
        `للموافقة: /approve_${withdrawalId}\n` +
        `للرفض: /reject_${withdrawalId}`,
      );
    }

    res.json({ ok: true, withdrawalId, message: "تم إرسال طلب السحب، سيتم مراجعته قريباً." });
  } catch (err) {
    logger.error({ err }, "POST /telegram/withdraw failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/telegram/withdraw/status ────────────────────────────────────────
router.get("/telegram/withdraw/status", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.json([]); return; }
  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.json([]); return; }
  const user = verifyInitData(initData, token);
  if (!user) { res.json([]); return; }

  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      "SELECT id, amount, status, tx_hash, created_at, processed_at FROM gm_withdrawals WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 10",
      [user.id],
    );
    res.json(result.rows);
  } catch { res.json([]); }
});

// Admin withdrawal routes have been moved to the consolidated
// GET|POST /api/admin/general?type=withdrawals handler in admin.ts

export default router;
