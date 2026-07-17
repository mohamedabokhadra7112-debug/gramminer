/**
 * Public task routes (no admin auth required):
 *   GET  /api/tasks              — list visible tasks
 *   POST /api/tasks/complete     — mark a task done + credit reward
 */
import { Router, type IRouter } from "express";
import { verifyInitData } from "../lib/telegramAuth";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

// ── Lazy DB migrations ────────────────────────────────────────────────────────
let migrated = false;
async function ensureSchema() {
  if (migrated) return;
  migrated = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS channel_username text`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_task_completions (
        id          serial PRIMARY KEY,
        telegram_id bigint  NOT NULL,
        task_id     integer NOT NULL,
        completed_at timestamp NOT NULL DEFAULT NOW(),
        UNIQUE(telegram_id, task_id)
      )
    `);
  } catch (e) {
    logger.warn({ e }, "tasks schema migration skipped");
  }
}

// ── GET /api/tasks ────────────────────────────────────────────────────────────
router.get("/tasks", async (_req, res) => {
  await ensureSchema();
  const db = await getDb();
  if (!db) { res.json([]); return; }

  try {
    const { tasksTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.isHidden, false))
      .orderBy(tasksTable.createdAt);
    res.json(tasks);
  } catch (err) {
    logger.error({ err }, "GET /tasks failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/tasks/complete ──────────────────────────────────────────────────
router.post("/tasks/complete", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, taskId } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  if (!taskId) {
    res.status(400).json({ error: "taskId required" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureSchema();
  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { pool, tasksTable, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    // Load task
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, Number(taskId)));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    // Already completed?
    const existing = await pool.query(
      "SELECT id FROM gm_task_completions WHERE telegram_id=$1 AND task_id=$2",
      [user.id, task.id],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "already_completed" }); return;
    }

    // Channel membership check
    const channelUsername = task.channelUsername ?? null;
    if (channelUsername) {
      try {
        const r = await fetch(
          `https://api.telegram.org/bot${token}/getChatMember?chat_id=@${channelUsername}&user_id=${user.id}`,
        );
        const data = (await r.json()) as { result?: { status?: string } };
        const st = data?.result?.status;
        const isMember = st === "member" || st === "administrator" || st === "creator";
        if (!isMember) {
          res.status(403).json({ error: "not_member", channelUsername });
          return;
        }
      } catch {
        // If Telegram API fails, let it through so users aren't blocked by network errors
      }
    }

    // Record completion
    await pool.query(
      "INSERT INTO gm_task_completions (telegram_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [user.id, task.id],
    );

    // Credit reward
    const [updated] = await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${task.reward}`, lastActiveAt: new Date() })
      .where(eq(usersTable.telegramId, user.id))
      .returning({ balance: usersTable.balance });

    res.json({ ok: true, reward: task.reward, balance: updated?.balance ?? 0 });
  } catch (err) {
    logger.error({ err }, "POST /tasks/complete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/tasks/completed ──────────────────────────────────────────────────
// Returns the list of completed task IDs for the current user.
router.get("/tasks/completed", async (req, res): Promise<void> => {
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
      "SELECT task_id FROM gm_task_completions WHERE telegram_id=$1",
      [user.id],
    );
    res.json(result.rows.map((r: { task_id: number }) => r.task_id));
  } catch {
    res.json([]);
  }
});

export default router;
