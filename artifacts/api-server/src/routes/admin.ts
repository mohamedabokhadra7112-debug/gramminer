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
  const { amount } = req.body as { amount: number }; // positive = add, negative = deduct

  try {
    const { usersTable } = await import("@workspace/db");
    await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${amount}` })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin/users balance error");
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

export default router;
