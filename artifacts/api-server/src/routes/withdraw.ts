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
        `💰 المبلغ: ${amt.toFixed(4)} GMR\n` +
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

// ── GET /api/admin/withdrawals ────────────────────────────────────────────────
router.get("/admin/withdrawals", requireAdmin, async (_req, res) => {
  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT w.*, u.first_name, u.username
       FROM gm_withdrawals w
       LEFT JOIN gm_users u ON u.telegram_id = w.telegram_id
       ORDER BY w.created_at DESC LIMIT 100`,
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "GET /admin/withdrawals failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/admin/withdrawals/:id/approve ───────────────────────────────────
router.post("/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
  await ensureSchema();
  const id = Number(req.params.id);

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const result = await pool.query(
      "SELECT * FROM gm_withdrawals WHERE id=$1 AND status='pending'",
      [id],
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Withdrawal not found or not pending" }); return;
    }
    const w = result.rows[0];

    // Send TON
    const txHash = await sendTon(w.wallet_address, w.amount);
    const success = txHash !== null;

    if (success) {
      await pool.query(
        "UPDATE gm_withdrawals SET status='approved', tx_hash=$1, processed_at=NOW() WHERE id=$2",
        [txHash, id],
      );
      // Notify user
      await notifyTelegram(
        w.telegram_id,
        `✅ <b>تم تأكيد طلب السحب!</b>\n\n💰 المبلغ: ${w.amount} GMR\n📍 المحفظة: <code>${w.wallet_address}</code>\n🔗 TX: ${txHash}`,
      );
      res.json({ ok: true, txHash });
    } else {
      // Send failed — refund balance
      if (db) {
        await db.update(usersTable)
          .set({ balance: (await (db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.telegramId, w.telegram_id)))[0]?.balance ?? 0) + w.amount })
          .where(eq(usersTable.telegramId, w.telegram_id));
      }
      await pool.query("UPDATE gm_withdrawals SET status='rejected', rejection_reason='TON send failed', processed_at=NOW() WHERE id=$1", [id]);
      res.status(502).json({ error: "TON send failed — balance refunded. Check OWNER_SECRET_KEY / OWNER_PUBLIC_KEY." });
    }
  } catch (err) {
    logger.error({ err }, "approve withdrawal failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/admin/withdrawals/:id/reject ────────────────────────────────────
router.post("/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
  await ensureSchema();
  const id = Number(req.params.id);
  const reason = (req.body?.reason as string) || "تم رفض الطلب من قبل الإدارة";

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const result = await pool.query(
      "SELECT * FROM gm_withdrawals WHERE id=$1 AND status='pending'",
      [id],
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Withdrawal not found or not pending" }); return;
    }
    const w = result.rows[0];

    // Refund balance
    if (db) {
      const [row] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.telegramId, w.telegram_id));
      await db.update(usersTable)
        .set({ balance: (row?.balance ?? 0) + w.amount })
        .where(eq(usersTable.telegramId, w.telegram_id));
    }

    await pool.query(
      "UPDATE gm_withdrawals SET status='rejected', rejection_reason=$1, processed_at=NOW() WHERE id=$2",
      [reason, id],
    );

    // Notify user
    await notifyTelegram(
      w.telegram_id,
      `❌ <b>تم رفض طلب السحب</b>\n\n💰 المبلغ: ${w.amount} GMR\nالسبب: ${reason}\n\n✅ تم إعادة الرصيد لحسابك.`,
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "reject withdrawal failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
