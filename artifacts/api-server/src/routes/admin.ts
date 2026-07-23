/**
 * Consolidated admin API — all routes use query parameters instead of
 * separate paths so each admin capability remains independently testable.
 *
 *   GET  /api/admin/general?type=stats|settings|tasks|channels|miners|withdrawals|admins
 *   POST /api/admin/general?type=settings|broadcast|tasks|channels|miners|admins
 *        POST  ?type=withdrawals&action=approve|reject&id=N
 *   PATCH  /api/admin/general?type=tasks&id=N
 *   DELETE /api/admin/general?type=tasks|channels|admins&id=N
 *
 *   GET    /api/admin/users?action=search&q=...
 *   POST   /api/admin/users?action=ban|restrict|balance|balance_set|warn&id=N
 *   DELETE /api/admin/users?id=N
 */

import { Router, type IRouter } from "express";
import { eq, count, sql, or, ilike } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(requireAdmin);

// ─── helpers ─────────────────────────────────────────────────────────────────

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

async function notifyUser(chatId: number, text: string) {
  const token = getBotToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

async function sendTon(toAddress: string, amountTon: number): Promise<string | null> {
  try {
    const TonWeb = (await import("tonweb")).default ?? (await import("tonweb"));
    const secretKeyEnv = process.env["OWNER_SECRET_KEY"];
    const publicKeyEnv = process.env["OWNER_PUBLIC_KEY"];
    if (!secretKeyEnv || !publicKeyEnv) {
      logger.error("OWNER_SECRET_KEY / OWNER_PUBLIC_KEY not set");
      return null;
    }
    const SecretKey = Uint8Array.from(JSON.parse(secretKeyEnv) as number[]);
    const PublicKey = Uint8Array.from(JSON.parse(publicKeyEnv) as number[]);
    const tonweb = new TonWeb();
    const wallet = tonweb.wallet.create({ publicKey: PublicKey });
    const seqno = await (wallet as any).methods.seqno().call();
    const result = await (wallet as any).methods.transfer({
      secretKey: SecretKey, toAddress,
      amount: TonWeb.utils.toNano(String(amountTon)),
      seqno: seqno ?? 0, payload: "GramMiner Withdrawal", sendMode: 3,
    }).send();
    const txHash = (result as any)?.transaction?.id?.hash ?? null;
    return txHash ? String(txHash) : "sent";
  } catch (err) {
    logger.error({ err }, "TON send failed");
    return null;
  }
}

type SubAdmin = { telegramId: number; username: string; permissions: string[] };

async function getSubAdmins(): Promise<SubAdmin[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const { settingsTable } = await import("@workspace/db");
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "sub_admins"));
    return row?.value ? (JSON.parse(row.value) as SubAdmin[]) : [];
  } catch { return []; }
}

async function saveSubAdmins(admins: SubAdmin[]) {
  const db = await getDb();
  if (!db) return;
  const { settingsTable } = await import("@workspace/db");
  const val = JSON.stringify(admins);
  await db.insert(settingsTable).values({ key: "sub_admins", value: val })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: val } });
}

const DEFAULT_MINERS = [
  { id: 1,  name: "Stone Collector",     baseCost: 10,    dailyPct: 0.05, description: "" },
  { id: 2,  name: "Copper Miner",        baseCost: 50,    dailyPct: 0.05, description: "" },
  { id: 3,  name: "Ore Cart",            baseCost: 250,   dailyPct: 0.05, description: "" },
  { id: 4,  name: "Crystal Hunter",      baseCost: 500,   dailyPct: 0.05, description: "" },
  { id: 5,  name: "Forge Master",        baseCost: 1000,  dailyPct: 0.05, description: "" },
  { id: 6,  name: "Mining Drone",        baseCost: 2000,  dailyPct: 0.08, description: "" },
  { id: 7,  name: "Quantum Excavator",   baseCost: 5000,  dailyPct: 0.08, description: "" },
  { id: 8,  name: "Satellite Extractor", baseCost: 10000, dailyPct: 0.08, description: "" },
  { id: 9,  name: "Planet Miner",        baseCost: 15000, dailyPct: 0.08, description: "" },
  { id: 10, name: "Gram Core Reactor",   baseCost: 20000, dailyPct: 0.08, description: "" },
];

// ─── GET|POST|PATCH|DELETE /admin/general ────────────────────────────────────
router.all("/admin/general", async (req, res) => {
  const type   = req.query.type   as string | undefined;
  const action = req.query.action as string | undefined;
  const id     = req.query.id ? Number(req.query.id) : undefined;
  const method = req.method;
  const db     = await getDb();

  try {
    // ── stats ─────────────────────────────────────────────────────────────────
    if (type === "stats") {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { usersTable } = await import("@workspace/db");
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const [totalResult]   = await db.select({ count: count() }).from(usersTable);
      const [blockedResult] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.blockedBot, true));
      const [activeResult]  = await db.select({ count: count() }).from(usersTable).where(sql`${usersTable.lastActiveAt} >= ${fiveMinutesAgo}`);
      res.json({
        totalUsers:   totalResult?.count   ?? 0,
        blockedUsers: blockedResult?.count ?? 0,
        activeUsers:  activeResult?.count  ?? 0,
      });

    // ── settings ──────────────────────────────────────────────────────────────
    } else if (type === "settings") {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { settingsTable } = await import("@workspace/db");
      if (method === "GET") {
        const rows = await db.select().from(settingsTable);
        const out: Record<string, string> = {};
        for (const r of rows) out[r.key] = r.value;
        res.json(out);
      } else {
        const { key, value } = req.body as { key?: string; value?: string };
        if (!key || value === undefined) { res.status(400).json({ error: "key and value required" }); return; }
        await db.insert(settingsTable).values({ key, value })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
        res.json({ ok: true });
      }

    // ── broadcast ─────────────────────────────────────────────────────────────
    } else if (type === "broadcast") {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const token = getBotToken();
      if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }
      const { message } = req.body as { message?: string };
      if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }
      const { usersTable } = await import("@workspace/db");
      const users = await db.select({ telegramId: usersTable.telegramId }).from(usersTable).where(eq(usersTable.blockedBot, false));
      let sent = 0, failed = 0;
      for (const u of users) {
        try {
          const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: u.telegramId, text: message, parse_mode: "HTML" }),
          });
          if (r.ok) { sent++; } else {
            failed++;
            const d = await r.json().catch(() => ({})) as { error_code?: number };
            if (d.error_code === 403) await db.update(usersTable).set({ blockedBot: true }).where(eq(usersTable.telegramId, u.telegramId));
          }
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 35));
      }
      res.json({ ok: true, sent, failed, total: users.length });

    // ── tasks ─────────────────────────────────────────────────────────────────
    } else if (type === "tasks") {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { tasksTable } = await import("@workspace/db");
      if (method === "GET") {
        res.json(await db.select().from(tasksTable).orderBy(tasksTable.createdAt));
      } else if (method === "POST") {
        const { title, description, reward, isDaily, channelUsername } = req.body as {
          title?: string; description?: string; reward?: number; isDaily?: boolean; channelUsername?: string;
        };
        if (!title) { res.status(400).json({ error: "title required" }); return; }
        try {
          const { pool } = await import("@workspace/db");
          await pool.query("ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS channel_username text");
        } catch { /* ignore */ }
        const [task] = await db.insert(tasksTable).values({
          title, description: description ?? "", reward: reward ?? 0,
          isDaily: isDaily ?? false, channelUsername: channelUsername?.replace(/^@/, "") ?? null,
        }).returning();
        res.json(task);
      } else if (method === "PATCH" && id) {
        const updates = req.body as Partial<{ isHidden: boolean; isDaily: boolean; title: string; description: string; reward: number }>;
        const [task] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
        res.json(task);
      } else if (method === "DELETE" && id) {
        await db.delete(tasksTable).where(eq(tasksTable.id, id));
        res.json({ ok: true });
      } else { res.status(400).json({ error: "Invalid method or missing id" }); }

    // ── channels ──────────────────────────────────────────────────────────────
    } else if (type === "channels") {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { channelsTable } = await import("@workspace/db");
      if (method === "GET") {
        res.json(await db.select().from(channelsTable).orderBy(channelsTable.createdAt));
      } else if (method === "POST") {
        const { channelUsername, channelName } = req.body as { channelUsername?: string; channelName?: string };
        if (!channelUsername) { res.status(400).json({ error: "channelUsername required" }); return; }
        const [ch] = await db.insert(channelsTable).values({
          channelUsername: channelUsername.replace(/^@/, ""), channelName: channelName ?? "",
        }).returning();
        res.json(ch);
      } else if (method === "DELETE" && id) {
        await db.delete(channelsTable).where(eq(channelsTable.id, id));
        res.json({ ok: true });
      } else { res.status(400).json({ error: "Invalid method or missing id" }); }

    // ── miners ────────────────────────────────────────────────────────────────
    } else if (type === "miners") {
      if (method === "GET") {
        if (!db) { res.json(DEFAULT_MINERS); return; }
        const { settingsTable } = await import("@workspace/db");
        const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "miners_config"));
        res.json(row?.value ? JSON.parse(row.value) : DEFAULT_MINERS);
      } else if (method === "POST") {
        if (!db) { res.status(503).json({ error: "Database not available" }); return; }
        const { miners } = req.body as { miners?: unknown[] };
        if (!Array.isArray(miners)) { res.status(400).json({ error: "miners array required" }); return; }
        const { settingsTable } = await import("@workspace/db");
        const val = JSON.stringify(miners);
        await db.insert(settingsTable).values({ key: "miners_config", value: val })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: val } });
        res.json({ ok: true });
      } else { res.status(405).json({ error: "Method not allowed" }); }

    // ── withdrawals ───────────────────────────────────────────────────────────
    } else if (type === "withdrawals") {
      const { pool } = await import("@workspace/db");
      // Ensure table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS gm_withdrawals (
          id serial PRIMARY KEY, telegram_id bigint NOT NULL,
          wallet_address text NOT NULL, amount double precision NOT NULL,
          status text NOT NULL DEFAULT 'pending', tx_hash text,
          rejection_reason text, created_at timestamp NOT NULL DEFAULT NOW(), processed_at timestamp
        )
      `).catch(() => {});

      if (method === "GET") {
        const result = await pool.query(
          `SELECT w.*, u.first_name, u.username
           FROM gm_withdrawals w
           LEFT JOIN gm_users u ON u.telegram_id = w.telegram_id
           ORDER BY w.created_at DESC LIMIT 100`,
        );
        res.json(result.rows);

      } else if (method === "POST" && action === "approve" && id) {
        const result = await pool.query(
          "SELECT * FROM gm_withdrawals WHERE id=$1 AND status='pending'", [id],
        );
        if (!result.rows.length) { res.status(404).json({ error: "Not found or already processed" }); return; }
        const w = result.rows[0];
        const txHash = await sendTon(w.wallet_address, w.amount);
        if (txHash) {
          await pool.query(
            "UPDATE gm_withdrawals SET status='approved', tx_hash=$1, processed_at=NOW() WHERE id=$2",
            [txHash, id],
          );
          await notifyUser(w.telegram_id,
            `✅ <b>تم تأكيد طلب السحب!</b>\n\n💰 المبلغ: ${w.amount} gram\n📍 المحفظة: <code>${w.wallet_address}</code>\n🔗 TX: ${txHash}`,
          );
          res.json({ ok: true, txHash });
        } else {
          // Send failed — refund
          if (db) {
            const { usersTable } = await import("@workspace/db");
            const [row] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.telegramId, w.telegram_id));
            await db.update(usersTable).set({ balance: (row?.balance ?? 0) + w.amount }).where(eq(usersTable.telegramId, w.telegram_id));
          }
          await pool.query("UPDATE gm_withdrawals SET status='rejected', rejection_reason='TON send failed', processed_at=NOW() WHERE id=$1", [id]);
          res.status(502).json({ error: "TON send failed — balance refunded. Check OWNER_SECRET_KEY / OWNER_PUBLIC_KEY." });
        }

      } else if (method === "POST" && action === "reject" && id) {
        const reason = (req.body as { reason?: string })?.reason || "تم رفض الطلب من قبل الإدارة";
        const result = await pool.query(
          "SELECT * FROM gm_withdrawals WHERE id=$1 AND status='pending'", [id],
        );
        if (!result.rows.length) { res.status(404).json({ error: "Not found or already processed" }); return; }
        const w = result.rows[0];
        if (db) {
          const { usersTable } = await import("@workspace/db");
          const [row] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.telegramId, w.telegram_id));
          await db.update(usersTable).set({ balance: (row?.balance ?? 0) + w.amount }).where(eq(usersTable.telegramId, w.telegram_id));
        }
        await pool.query(
          "UPDATE gm_withdrawals SET status='rejected', rejection_reason=$1, processed_at=NOW() WHERE id=$2",
          [reason, id],
        );
        await notifyUser(w.telegram_id,
          `❌ <b>تم رفض طلب السحب</b>\n\n💰 المبلغ: ${w.amount} gram\nالسبب: ${reason}\n\n✅ تم إعادة الرصيد لحسابك.`,
        );
        res.json({ ok: true });

      } else { res.status(400).json({ error: "Invalid method or missing action/id" }); }

    // ── admins (sub-admins) ───────────────────────────────────────────────────
    } else if (type === "admins") {
      if (method === "GET") {
        res.json(await getSubAdmins());
      } else if (method === "POST") {
        if (!db) { res.status(503).json({ error: "Database not available" }); return; }
        const { telegramId, username, permissions } = req.body as { telegramId?: number; username?: string; permissions?: string[] };
        if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }
        const admins = await getSubAdmins();
        if (!admins.find(a => a.telegramId === telegramId)) {
          admins.push({ telegramId, username: username ?? "", permissions: permissions ?? [] });
        }
        await saveSubAdmins(admins);
        res.json({ ok: true });
      } else if (method === "DELETE" && id) {
        const admins = await getSubAdmins();
        await saveSubAdmins(admins.filter(a => a.telegramId !== id));
        res.json({ ok: true });
      } else { res.status(400).json({ error: "Invalid method or missing id" }); }

    } else {
      res.status(400).json({ error: `Unknown type: ${type ?? "(none)"}` });
    }
  } catch (err) {
    logger.error({ err }, "admin/general error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET|POST|DELETE /admin/users ────────────────────────────────────────────
router.all("/admin/users", async (req, res) => {
  const action = req.query.action as string | undefined;
  const id     = req.query.id ? Number(req.query.id) : undefined;
  const method = req.method;
  const db     = await getDb();

  try {
    // ── search ────────────────────────────────────────────────────────────────
    if (method === "GET" && action === "search") {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const q = ((req.query.q as string | undefined) ?? "").trim();
      if (!q) { res.status(400).json({ error: "q (telegram_id, username, or name) required" }); return; }
      const { usersTable } = await import("@workspace/db");
      // Pure-digit string → Telegram ID lookup (exact)
      // Anything else   → case-insensitive partial match on username OR first_name
      const byId = /^\d+$/.test(q);
      let users;
      if (byId) {
        users = await db.select().from(usersTable)
          .where(eq(usersTable.telegramId, Number(q)))
          .limit(1);
      } else {
        const cleanQ = q.replace(/^@/, "");
        users = await db.select().from(usersTable)
          .where(or(
            ilike(usersTable.username, cleanQ),          // exact username, case-insensitive
            ilike(usersTable.firstName, `%${cleanQ}%`),  // partial first-name match
          ))
          .limit(20);
      }
      res.json(users);

    // ── ban / unban ───────────────────────────────────────────────────────────
    } else if (method === "POST" && action === "ban" && id) {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { ban } = req.body as { ban: boolean };
      const { usersTable } = await import("@workspace/db");
      await db.update(usersTable).set({ isBanned: ban }).where(eq(usersTable.telegramId, id));
      res.json({ ok: true });

    // ── restrict withdrawal ───────────────────────────────────────────────────
    } else if (method === "POST" && action === "restrict" && id) {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { restrict } = req.body as { restrict: boolean };
      const { usersTable } = await import("@workspace/db");
      await db.update(usersTable).set({ restrictWithdrawal: restrict }).where(eq(usersTable.telegramId, id));
      res.json({ ok: true });

    // ── adjust balance ────────────────────────────────────────────────────────
    } else if (method === "POST" && action === "balance" && id) {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const rawAmount = Number((req.body as { amount: unknown }).amount);
      if (!Number.isFinite(rawAmount)) { res.status(400).json({ error: "Invalid amount" }); return; }
      const amount = Math.max(-1_000_000, Math.min(1_000_000, rawAmount));
      const { usersTable } = await import("@workspace/db");
      const [row] = await db.update(usersTable)
        .set({ balance: sql`ROUND(CAST(${usersTable.balance} AS numeric) + CAST(${amount} AS numeric), 6)::double precision` })
        .where(eq(usersTable.telegramId, id))
        .returning({ balance: usersTable.balance });
      res.json({ ok: true, balance: row?.balance ?? 0 });

    // ── set balance ───────────────────────────────────────────────────────────
    } else if (method === "POST" && action === "balance_set" && id) {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const rawValue = Number((req.body as { value: unknown }).value);
      if (!Number.isFinite(rawValue) || rawValue < 0) { res.status(400).json({ error: "value must be non-negative" }); return; }
      const value = Math.round(rawValue * 1_000_000) / 1_000_000;
      const { usersTable } = await import("@workspace/db");
      const [row] = await db.update(usersTable).set({ balance: value }).where(eq(usersTable.telegramId, id)).returning({ balance: usersTable.balance });
      logger.info({ telegramId: id, newBalance: row?.balance }, "admin set balance");
      res.json({ ok: true, balance: row?.balance ?? value });

    // ── warn (send Telegram message) ──────────────────────────────────────────
    } else if (method === "POST" && action === "warn" && id) {
      const { message } = req.body as { message?: string };
      const token = getBotToken();
      if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }
      if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id, text: `⚠️ <b>تحذير من الإدارة</b>\n\n${message}`, parse_mode: "HTML" }),
      });
      if (!r.ok) { res.status(502).json({ error: "Telegram API error" }); return; }
      res.json({ ok: true });

    // ── delete user ───────────────────────────────────────────────────────────
    } else if (method === "DELETE" && id) {
      if (!db) { res.status(503).json({ error: "Database not available" }); return; }
      const { usersTable } = await import("@workspace/db");
      const { pool } = await import("@workspace/db");
      await pool.query("DELETE FROM gm_task_completions WHERE telegram_id=$1", [id]).catch(() => {});
      await pool.query("DELETE FROM gm_withdrawals WHERE telegram_id=$1 AND status='pending'", [id]).catch(() => {});
      await db.delete(usersTable).where(eq(usersTable.telegramId, id));
      res.json({ ok: true });

    } else {
      res.status(400).json({ error: `Invalid action or missing id (action=${action}, id=${id})` });
    }
  } catch (err) {
    logger.error({ err }, "admin/users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
