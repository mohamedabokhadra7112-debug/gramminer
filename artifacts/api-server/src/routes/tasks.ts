/**
 * Task routes:
 *   GET  /api/tasks              — list visible, enabled tasks
 *   POST /api/tasks/complete     — mark a task done + credit reward (with getChatMember check)
 *   GET  /api/tasks/completed    — list completed task IDs for user
 *
 *   GET    /api/admin/tasks         — admin: list all tasks (via admin.ts handler preserved)
 *   POST   /api/admin/tasks         — admin: create task (enhanced fields)
 *   PATCH  /api/admin/tasks/:id     — admin: update task
 *   DELETE /api/admin/tasks/:id     — admin: delete task
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

// ── Lazy DB migrations ────────────────────────────────────────────────────────
let migrated = false;
async function ensureSchema() {
  if (migrated) return;
  migrated = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS channel_username text`);
    await pool.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS task_type text`);
    await pool.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS join_link text`);
    await pool.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS chat_id text`);
    await pool.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true`);
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
    const { pool } = await import("@workspace/db");
    const result = await pool.query(
      `SELECT * FROM gm_tasks WHERE is_hidden=false AND (is_enabled IS NULL OR is_enabled=true) ORDER BY created_at`,
    );
    res.json(result.rows);
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
    const { pool, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    // Load task from DB (raw SQL so we get new columns too)
    const taskRes = await pool.query(
      `SELECT * FROM gm_tasks WHERE id=$1`,
      [Number(taskId)],
    );
    if (!taskRes.rows.length) { res.status(404).json({ error: "Task not found" }); return; }
    const task = taskRes.rows[0] as {
      id: number; title: string; reward: number; is_daily: boolean;
      is_hidden: boolean; is_enabled: boolean | null;
      channel_username: string | null; task_type: string | null;
      join_link: string | null; chat_id: string | null;
    };

    // Check enabled
    if (task.is_enabled === false) {
      res.status(403).json({ error: "Task is disabled" }); return;
    }

    // Already completed? (daily tasks reset after 24h)
    if (task.is_daily) {
      const existing = await pool.query(
        `SELECT id FROM gm_task_completions
         WHERE telegram_id=$1 AND task_id=$2 AND completed_at > NOW() - INTERVAL '24 hours'`,
        [user.id, task.id],
      );
      if (existing.rows.length > 0) {
        res.status(409).json({ error: "already_completed" }); return;
      }
    } else {
      const existing = await pool.query(
        "SELECT id FROM gm_task_completions WHERE telegram_id=$1 AND task_id=$2",
        [user.id, task.id],
      );
      if (existing.rows.length > 0) {
        res.status(409).json({ error: "already_completed" }); return;
      }
    }

    // Channel / group membership check via getChatMember
    // Use chat_id if available, else fall back to channel_username
    const chatTarget = task.chat_id || task.channel_username;
    if (chatTarget) {
      try {
        const chatParam = chatTarget.startsWith("-") || /^\d+$/.test(chatTarget)
          ? chatTarget
          : `@${chatTarget.replace(/^@/, "")}`;
        const r = await fetch(
          `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatParam)}&user_id=${user.id}`,
        );
        const data = (await r.json()) as { result?: { status?: string } };
        const st = data?.result?.status;
        const isMember = st === "member" || st === "administrator" || st === "creator";
        if (!isMember) {
          res.status(403).json({
            error: "not_member",
            channelUsername: task.channel_username,
            joinLink: task.join_link,
          });
          return;
        }
      } catch {
        // Telegram API failure — allow through so users aren't blocked
      }
    }

    // Record completion.
    // Daily tasks: UPSERT — update completed_at so the 24h window resets correctly.
    // Non-daily tasks: insert once, ignore duplicates.
    const now = new Date();
    if (task.is_daily) {
      await pool.query(
        `INSERT INTO gm_task_completions (telegram_id, task_id, completed_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id, task_id) DO UPDATE SET completed_at = $3`,
        [user.id, task.id, now],
      );
    } else {
      await pool.query(
        "INSERT INTO gm_task_completions (telegram_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [user.id, task.id],
      );
    }

    // Credit reward as coins
    await pool.query("ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0").catch(() => {});

    const [updated] = await db
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} + ${Math.round(task.reward)}`, lastActiveAt: new Date() })
      .where(eq(usersTable.telegramId, user.id))
      .returning({ coins: usersTable.coins });

    res.json({
      ok: true,
      reward: Math.round(task.reward),
      coins: updated?.coins ?? 0,
      completedAt: now.toISOString(),
      isDaily: task.is_daily,
    });
  } catch (err) {
    logger.error({ err }, "POST /tasks/complete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/tasks/completed ──────────────────────────────────────────────────
// Returns objects with taskId + completedAt + isDaily so the frontend can
// correctly show the 24h countdown for daily tasks.
// Works without BOT_TOKEN in dev (falls back to returning all completions without auth).
router.get("/tasks/completed", async (req, res): Promise<void> => {
  const token = getBotToken();
  const initData = req.headers["x-init-data"] as string | undefined;

  let userId: number | null = null;
  if (token && initData) {
    const user = verifyInitData(initData, token);
    userId = user?.id ?? null;
  }

  if (!userId) { res.json([]); return; }

  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    // Join with gm_tasks to get is_daily flag
    const result = await pool.query<{
      task_id: number; completed_at: string; is_daily: boolean;
    }>(
      `SELECT tc.task_id, tc.completed_at, COALESCE(t.is_daily, false) AS is_daily
       FROM gm_task_completions tc
       LEFT JOIN gm_tasks t ON t.id = tc.task_id
       WHERE tc.telegram_id = $1`,
      [userId],
    );
    res.json(result.rows.map(r => ({
      taskId:      r.task_id,
      completedAt: r.completed_at,
      isDaily:     r.is_daily,
    })));
  } catch {
    res.json([]);
  }
});

// ── Admin task CRUD ───────────────────────────────────────────────────────────
const adminRouter: IRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/tasks
adminRouter.get("/admin/tasks", async (_req, res) => {
  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query("SELECT * FROM gm_tasks ORDER BY created_at");
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "GET /admin/tasks failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/admin/tasks
adminRouter.post("/admin/tasks", async (req, res): Promise<void> => {
  const {
    title, description, reward, isDaily, channelUsername,
    taskType, joinLink, chatId, isEnabled = true,
  } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title required" }); return;
  }

  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ id: number }>(
      `INSERT INTO gm_tasks
         (title, description, reward, is_daily, channel_username, task_type, join_link, chat_id, is_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        title.trim(),
        String(description ?? ""),
        Number(reward ?? 0),
        Boolean(isDaily),
        channelUsername ? String(channelUsername).replace(/^@/, "") : null,
        taskType ? String(taskType) : null,
        joinLink ? String(joinLink) : null,
        chatId ? String(chatId) : null,
        Boolean(isEnabled),
      ],
    );
    res.json({ ok: true, id: result.rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "POST /admin/tasks failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// PATCH /api/admin/tasks/:id
adminRouter.patch("/admin/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updates: string[] = [];
  const params: unknown[] = [];
  const body = (req.body ?? {}) as Record<string, unknown>;

  const fieldMap: Record<string, string> = {
    title: "title", description: "description", reward: "reward",
    isDaily: "is_daily", isHidden: "is_hidden", isEnabled: "is_enabled",
    channelUsername: "channel_username", taskType: "task_type",
    joinLink: "join_link", chatId: "chat_id",
  };

  for (const [jsKey, sqlCol] of Object.entries(fieldMap)) {
    if (body[jsKey] !== undefined) {
      let val: unknown = body[jsKey];
      if (jsKey === "channelUsername" && typeof val === "string") val = val.replace(/^@/, "");
      if (jsKey === "reward") val = Number(val);
      if (["isDaily", "isHidden", "isEnabled"].includes(jsKey)) val = Boolean(val);
      params.push(val);
      updates.push(`${sqlCol}=$${params.length}`);
    }
  }

  if (updates.length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    params.push(id);
    await pool.query(
      `UPDATE gm_tasks SET ${updates.join(", ")} WHERE id=$${params.length}`,
      params,
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PATCH /admin/tasks/:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/admin/tasks/:id
adminRouter.delete("/admin/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await ensureSchema();
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("DELETE FROM gm_tasks WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /admin/tasks/:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.use(adminRouter);

export default router;
