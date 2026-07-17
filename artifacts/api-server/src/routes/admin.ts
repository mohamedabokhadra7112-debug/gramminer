import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Apply admin guard to all routes in this file
router.use(requireAdmin);

// ─── Helper ──────────────────────────────────────────────────────────────────

function noDb(res: Parameters<typeof router.get>[1] extends (req: any, res: infer R) => any ? R : never) {
  (res as any).status(503).json({ error: "Database not available. Set DATABASE_URL." });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get("/admin/stats", async (_req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [totalResult] = await db.select({ count: count() }).from(usersTable);
    const [blockedResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(eq(usersTable.blockedBot, true));
    const [activeResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(sql`${usersTable.lastActiveAt} >= ${fiveMinutesAgo}`);

    res.json({
      totalUsers: totalResult?.count ?? 0,
      blockedUsers: blockedResult?.count ?? 0,
      activeUsers: activeResult?.count ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "admin/stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/admin/settings", async (_req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  try {
    const { settingsTable } = await import("@workspace/db");
    const rows = await db.select().from(settingsTable);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    logger.error({ err }, "admin/settings GET error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/settings", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const { key, value } = req.body as { key?: string; value?: string };
  if (!key || value === undefined) {
    res.status(400).json({ error: "key and value are required" });
    return;
  }

  try {
    const { settingsTable } = await import("@workspace/db");
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/settings POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

router.get("/admin/tasks", async (_req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  try {
    const { tasksTable } = await import("@workspace/db");
    const tasks = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
    res.json(tasks);
  } catch (err) {
    logger.error({ err }, "admin/tasks GET error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/tasks", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const { title, description, reward, isDaily, channelUsername } = req.body as {
    title?: string; description?: string; reward?: number; isDaily?: boolean; channelUsername?: string;
  };
  if (!title) { res.status(400).json({ error: "title is required" }); return; }

  // Ensure channelUsername column exists (lazy migration)
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS channel_username text");
  } catch { /* ignore */ }

  try {
    const { tasksTable } = await import("@workspace/db");
    const [task] = await db
      .insert(tasksTable)
      .values({
        title,
        description: description ?? "",
        reward: reward ?? 0,
        isDaily: isDaily ?? false,
        channelUsername: channelUsername?.replace(/^@/, "") ?? null,
      })
      .returning();
    res.json(task);
  } catch (err) {
    logger.error({ err }, "admin/tasks POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/tasks/:id", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const id = Number(req.params.id);
  const updates = req.body as Partial<{ isHidden: boolean; isDaily: boolean; title: string; description: string; reward: number }>;

  try {
    const { tasksTable } = await import("@workspace/db");
    const [task] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
    res.json(task);
  } catch (err) {
    logger.error({ err }, "admin/tasks PATCH error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/tasks/:id", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const id = Number(req.params.id);
  try {
    const { tasksTable } = await import("@workspace/db");
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/tasks DELETE error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Channels ─────────────────────────────────────────────────────────────────

router.get("/admin/channels", async (_req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  try {
    const { channelsTable } = await import("@workspace/db");
    const channels = await db.select().from(channelsTable).orderBy(channelsTable.createdAt);
    res.json(channels);
  } catch (err) {
    logger.error({ err }, "admin/channels GET error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/channels", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const { channelUsername, channelName } = req.body as { channelUsername?: string; channelName?: string };
  if (!channelUsername) { res.status(400).json({ error: "channelUsername is required" }); return; }

  try {
    const { channelsTable } = await import("@workspace/db");
    const [ch] = await db
      .insert(channelsTable)
      .values({ channelUsername: channelUsername.replace(/^@/, ""), channelName: channelName ?? "" })
      .returning();
    res.json(ch);
  } catch (err) {
    logger.error({ err }, "admin/channels POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/channels/:id", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const id = Number(req.params.id);
  try {
    const { channelsTable } = await import("@workspace/db");
    await db.delete(channelsTable).where(eq(channelsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/channels DELETE error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── User management ──────────────────────────────────────────────────────────

router.get("/admin/users/search", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const q = (req.query.q ?? req.query.action === "search" ? req.query.q : undefined) as string | undefined;
  const searchQ = q ?? (req.query.q as string);
  if (!searchQ) { res.status(400).json({ error: "q (telegram_id or username) is required" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const byId = !isNaN(Number(searchQ));
    const users = byId
      ? await db.select().from(usersTable).where(eq(usersTable.telegramId, Number(searchQ))).limit(1)
      : await db.select().from(usersTable).where(eq(usersTable.username, searchQ)).limit(10);
    res.json(users);
  } catch (err) {
    logger.error({ err }, "admin/users/search error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete / reset a user ─────────────────────────────────────────────────
router.delete("/admin/users/:telegramId", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const telegramId = Number(req.params.telegramId);
  if (!telegramId) { res.status(400).json({ error: "Invalid telegramId" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { pool } = await import("@workspace/db");
    // Remove completions so re-joining feels fresh
    await pool.query("DELETE FROM gm_task_completions WHERE telegram_id=$1", [telegramId]).catch(() => {});
    await pool.query("DELETE FROM gm_withdrawals WHERE telegram_id=$1 AND status='pending'", [telegramId]).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/users DELETE error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users/:telegramId/ban", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const telegramId = Number(req.params.telegramId);
  const { ban } = req.body as { ban: boolean };

  try {
    const { usersTable } = await import("@workspace/db");
    await db.update(usersTable).set({ isBanned: ban }).where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/users ban error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users/:telegramId/balance", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const telegramId = Number(req.params.telegramId);
  const rawAmount = Number((req.body as { amount: unknown }).amount);
  if (!Number.isFinite(rawAmount)) {
    res.status(400).json({ error: "Invalid amount" }); return;
  }
  // Clamp the adjustment to ±1,000,000 to prevent accidental corruption
  const amount = Math.max(-1_000_000, Math.min(1_000_000, rawAmount));

  try {
    const { usersTable } = await import("@workspace/db");
    const [row] = await db
      .update(usersTable)
      .set({ balance: sql`ROUND(CAST(${usersTable.balance} AS numeric) + CAST(${amount} AS numeric), 6)::double precision` })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ balance: usersTable.balance });
    res.json({ ok: true, balance: row?.balance ?? 0 });
  } catch (err) {
    logger.error({ err }, "admin/users balance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Directly set (overwrite) a user's balance — used to correct corrupted values.
router.post("/admin/users/:telegramId/balance/set", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const telegramId = Number(req.params.telegramId);
  const rawValue = Number((req.body as { value: unknown }).value);
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    res.status(400).json({ error: "value must be a non-negative number" }); return;
  }
  const value = Math.round(rawValue * 1_000_000) / 1_000_000; // 6 dp precision

  try {
    const { usersTable } = await import("@workspace/db");
    const [row] = await db
      .update(usersTable)
      .set({ balance: value })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ balance: usersTable.balance });
    logger.info({ telegramId, newBalance: row?.balance }, "admin set balance");
    res.json({ ok: true, balance: row?.balance ?? value });
  } catch (err) {
    logger.error({ err }, "admin/users balance/set error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users/:telegramId/restrict", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const telegramId = Number(req.params.telegramId);
  const { restrict } = req.body as { restrict: boolean };

  try {
    const { usersTable } = await import("@workspace/db");
    await db
      .update(usersTable)
      .set({ restrictWithdrawal: restrict })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/users restrict error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Broadcast ────────────────────────────────────────────────────────────────

router.post("/admin/broadcast", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const users = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.blockedBot, false));

    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: user.telegramId, text: message, parse_mode: "HTML" }),
        });
        if (r.ok) {
          sent++;
        } else {
          failed++;
          const data = await r.json().catch(() => ({}) as { error_code?: number });
          if ((data as { error_code?: number }).error_code === 403) {
            await db.update(usersTable).set({ blockedBot: true }).where(eq(usersTable.telegramId, user.telegramId));
          }
        }
      } catch { failed++; }
      // Small delay to avoid Telegram rate limits
      await new Promise(r => setTimeout(r, 35));
    }

    res.json({ ok: true, sent, failed, total: users.length });
  } catch (err) {
    logger.error({ err }, "admin/broadcast error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Miners config (stored as JSON in settings table) ────────────────────────

const DEFAULT_MINERS = [
  { id: 1, name: "Stone Collector",     baseCost: 10,    dailyPct: 0.05, description: "" },
  { id: 2, name: "Copper Miner",        baseCost: 50,    dailyPct: 0.05, description: "" },
  { id: 3, name: "Ore Cart",            baseCost: 250,   dailyPct: 0.05, description: "" },
  { id: 4, name: "Crystal Hunter",      baseCost: 500,   dailyPct: 0.05, description: "" },
  { id: 5, name: "Forge Master",        baseCost: 1000,  dailyPct: 0.05, description: "" },
  { id: 6, name: "Mining Drone",        baseCost: 2000,  dailyPct: 0.08, description: "" },
  { id: 7, name: "Quantum Excavator",   baseCost: 5000,  dailyPct: 0.08, description: "" },
  { id: 8, name: "Satellite Extractor", baseCost: 10000, dailyPct: 0.08, description: "" },
  { id: 9, name: "Planet Miner",        baseCost: 15000, dailyPct: 0.08, description: "" },
  { id: 10, name: "Gram Core Reactor",  baseCost: 20000, dailyPct: 0.08, description: "" },
];

router.get("/admin/miners", async (_req, res) => {
  const db = await getDb();
  if (!db) { res.json(DEFAULT_MINERS); return; }

  try {
    const { settingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "miners_config"));
    res.json(row?.value ? JSON.parse(row.value) : DEFAULT_MINERS);
  } catch (err) {
    logger.error({ err }, "admin/miners GET error");
    res.json(DEFAULT_MINERS);
  }
});

router.post("/admin/miners", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const { miners } = req.body as { miners?: unknown[] };
  if (!Array.isArray(miners)) { res.status(400).json({ error: "miners array required" }); return; }

  try {
    const { settingsTable } = await import("@workspace/db");
    const val = JSON.stringify(miners);
    await db
      .insert(settingsTable)
      .values({ key: "miners_config", value: val })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: val } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/miners POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Warn a user (send Telegram message) ─────────────────────────────────────

router.post("/admin/users/:telegramId/warn", async (req, res) => {
  const telegramId = Number(req.params.telegramId);
  const { message } = req.body as { message?: string };

  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text: `⚠️ <b>تحذير من الإدارة</b>\n\n${message}`,
        parse_mode: "HTML",
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(502).json({ error: "Telegram API error", details: data }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/users warn error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Sub-admins (stored as JSON in settings table) ───────────────────────────

type SubAdmin = { telegramId: number; username: string; permissions: string[] };

async function getSubAdmins(db: Awaited<ReturnType<typeof getDb>>): Promise<SubAdmin[]> {
  if (!db) return [];
  try {
    const { settingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "sub_admins"));
    return row?.value ? (JSON.parse(row.value) as SubAdmin[]) : [];
  } catch { return []; }
}

async function saveSubAdmins(db: Awaited<ReturnType<typeof getDb>>, admins: SubAdmin[]) {
  if (!db) return;
  const { settingsTable } = await import("@workspace/db");
  const val = JSON.stringify(admins);
  await db
    .insert(settingsTable)
    .values({ key: "sub_admins", value: val })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: val } });
}

router.get("/admin/admins", async (_req, res) => {
  const db = await getDb();
  res.json(await getSubAdmins(db));
});

router.post("/admin/admins", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const { telegramId, username, permissions } = req.body as { telegramId?: number; username?: string; permissions?: string[] };
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  try {
    const admins = await getSubAdmins(db);
    if (!admins.find(a => a.telegramId === telegramId)) {
      admins.push({ telegramId, username: username ?? "", permissions: permissions ?? [] });
    }
    await saveSubAdmins(db, admins);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/admins POST error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/admins/:telegramId", async (req, res) => {
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  const telegramId = Number(req.params.telegramId);
  try {
    const admins = await getSubAdmins(db);
    await saveSubAdmins(db, admins.filter(a => a.telegramId !== telegramId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/admins DELETE error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
