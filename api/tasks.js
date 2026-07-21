// Tasks endpoint
// GET /api/tasks                          → all non-hidden tasks (no auth)
// GET /api/tasks?action=completed         → completion records for current user
// POST /api/tasks?action=complete         → record completion + credit coins (NOT balance)
// GET /api/tasks?type=combo               → today's combo status for current user
// POST /api/tasks?type=combo&action=submit → submit combo attempt
const { verifyTelegramUser, cors } = require('./admin/_auth');
const { getPool } = require('./admin/_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── GET /api/tasks?action=completed ─────────────────────────────────────────
  // Returns: { taskId, completedAt, isDaily }[]
  // Daily tasks include completedAt so the frontend can show a 24h countdown.
  if (action === 'completed' && req.method === 'GET') {
    const initData = req.headers['x-init-data'];
    if (!initData || !TOKEN) return res.json([]);

    const user = verifyTelegramUser(initData);
    if (!user) return res.json([]);

    const db = getPool();
    if (!db) return res.json([]);

    try {
      const { rows } = await db.query(
        `SELECT tc.task_id, tc.completed_at, t.is_daily
         FROM gm_task_completions tc
         JOIN gm_tasks t ON t.id = tc.task_id
         WHERE tc.telegram_id = $1`,
        [user.id]
      );
      return res.json(rows.map(r => ({
        taskId:      r.task_id,
        completedAt: r.completed_at,   // ISO timestamp string
        isDaily:     r.is_daily,
      })));
    } catch {
      return res.json([]);
    }
  }

  // ── POST /api/tasks?action=complete ─────────────────────────────────────────
  if (action === 'complete' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { initData, taskId } = body;

    if (!initData) return res.status(400).json({ error: 'initData required' });
    if (!taskId)   return res.status(400).json({ error: 'taskId required' });
    if (!TOKEN)    return res.status(503).json({ error: 'BOT_TOKEN not configured' });

    const user = verifyTelegramUser(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

    const db = getPool();
    if (!db) return res.status(503).json({ error: 'DATABASE_URL not configured' });

    try {
      // ── Ensure schema ──────────────────────────────────────────────────────
      await db.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS channel_username text`).catch(() => {});
      await db.query(`
        CREATE TABLE IF NOT EXISTS gm_task_completions (
          id           serial    PRIMARY KEY,
          telegram_id  bigint    NOT NULL,
          task_id      integer   NOT NULL,
          completed_at timestamp NOT NULL DEFAULT NOW(),
          UNIQUE(telegram_id, task_id)
        )
      `).catch(() => {});
      await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0`).catch(() => {});

      // ── Load task ──────────────────────────────────────────────────────────
      const { rows: taskRows } = await db.query(
        `SELECT id, title, reward, is_hidden, is_daily, channel_username FROM gm_tasks WHERE id = $1`,
        [Number(taskId)]
      );
      if (!taskRows.length || taskRows[0].is_hidden) {
        return res.status(404).json({ error: 'Task not found' });
      }
      const task = taskRows[0];

      // ── Already completed? ─────────────────────────────────────────────────
      const { rows: existing } = await db.query(
        `SELECT id, completed_at FROM gm_task_completions WHERE telegram_id = $1 AND task_id = $2`,
        [user.id, task.id]
      );

      if (existing.length > 0) {
        if (!task.is_daily) {
          // Non-daily: never allow re-completion
          return res.status(409).json({ error: 'already_completed' });
        }
        // Daily: allow re-completion only after 24 hours
        const lastDone = new Date(existing[0].completed_at);
        const hoursSince = (Date.now() - lastDone.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          const nextAvailableAt = new Date(lastDone.getTime() + 24 * 60 * 60 * 1000).toISOString();
          return res.status(409).json({
            error: 'already_completed',
            completedAt: existing[0].completed_at,
            nextAvailableAt,
          });
        }
        // 24h passed — fall through to re-record via ON CONFLICT DO UPDATE below
      }

      // ── Channel membership check ───────────────────────────────────────────
      if (task.channel_username) {
        try {
          const r = await fetch(
            `https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=@${task.channel_username}&user_id=${user.id}`
          );
          const data = await r.json();
          const st = data?.result?.status;
          const isMember = st === 'member' || st === 'administrator' || st === 'creator';
          if (!isMember) {
            return res.status(403).json({ error: 'not_member', channelUsername: task.channel_username });
          }
        } catch {
          // Telegram API unreachable — allow through to avoid blocking users
        }
      }

      // ── Record completion ──────────────────────────────────────────────────
      // Daily tasks: upsert (reset completed_at so the 24h window restarts).
      // Non-daily tasks: plain insert; ON CONFLICT DO NOTHING is a safety net only.
      let completedAt;
      if (task.is_daily) {
        const { rows: upserted } = await db.query(
          `INSERT INTO gm_task_completions (telegram_id, task_id)
           VALUES ($1, $2)
           ON CONFLICT (telegram_id, task_id) DO UPDATE SET completed_at = NOW()
           RETURNING completed_at`,
          [user.id, task.id]
        );
        completedAt = upserted[0]?.completed_at;
      } else {
        const { rows: inserted } = await db.query(
          `INSERT INTO gm_task_completions (telegram_id, task_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING
           RETURNING completed_at`,
          [user.id, task.id]
        );
        completedAt = inserted[0]?.completed_at;
      }

      // ── Credit reward as coins (NOT balance — balance is gram only) ────────
      const reward = Math.round(Number(task.reward) || 0);
      const { rows: updated } = await db.query(
        `UPDATE gm_users
            SET coins = coins + $1, last_active_at = NOW()
          WHERE telegram_id = $2
          RETURNING coins`,
        [reward, user.id]
      );

      return res.json({
        ok: true,
        reward,
        coins:       updated[0]?.coins ?? 0,
        completedAt, // ISO string — frontend uses this to start the 24h countdown
        isDaily:     task.is_daily,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Combo: GET /api/tasks?type=combo ────────────────────────────────────────
  // ── Combo: POST /api/tasks?type=combo&action=submit ─────────────────────────
  if (req.query.type === 'combo') {
    const COMBO_ITEMS = [
      { id: 1, name: 'Crystal Core'   },
      { id: 2, name: 'Mining Pickaxe' },
      { id: 3, name: 'Mining Rig'     },
      { id: 4, name: 'Server Node'    },
      { id: 5, name: 'Treasure Vault' },
    ];

    const initData = req.headers['x-telegram-initdata'] || req.headers['x-init-data'];
    if (!initData || !TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    const user = verifyTelegramUser(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

    const db = getPool();
    if (!db) return res.status(503).json({ error: 'DATABASE_URL not configured' });

    // Ensure combo attempts table exists (lazy migration)
    await db.query(`
      CREATE TABLE IF NOT EXISTS gm_combo_attempts (
        id          serial    PRIMARY KEY,
        telegram_id bigint    NOT NULL,
        combo_date  text      NOT NULL,
        success     boolean   NOT NULL,
        reward      integer   NOT NULL DEFAULT 0,
        created_at  timestamp NOT NULL DEFAULT NOW(),
        UNIQUE(telegram_id, combo_date)
      )
    `).catch(() => {});

    const today = new Date().toISOString().slice(0, 10);

    // Helper: get or generate today's correct combo from gm_settings
    async function getDailyCombo() {
      const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'daily_combo'`);
      if (rows.length > 0) {
        try {
          const parsed = JSON.parse(rows[0].value);
          if (parsed.date === today) return parsed;
        } catch (_) {}
      }
      const pool = [1, 2, 3, 4, 5];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const correctIds = pool.slice(0, 3).sort((a, b) => a - b);
      const combo = { date: today, correctIds };
      await db.query(
        `INSERT INTO gm_settings (key, value) VALUES ('daily_combo', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(combo)]
      );
      return combo;
    }

    // GET — return items + today's attempt status (no correct IDs revealed)
    if (req.method === 'GET') {
      const combo = await getDailyCombo();
      const { rows } = await db.query(
        `SELECT success, reward FROM gm_combo_attempts
         WHERE telegram_id = $1 AND combo_date = $2`,
        [user.id, today]
      );
      const attempt = rows[0] || null;
      return res.json({
        items:          COMBO_ITEMS,
        attemptedToday: !!attempt,
        success:        attempt ? attempt.success : null,
        reward:         attempt ? attempt.reward  : null,
      });
    }

    // POST?action=submit
    if (req.method === 'POST' && req.query.action === 'submit') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { selectedIds } = body;
      if (!Array.isArray(selectedIds) || selectedIds.length !== 3) {
        return res.status(400).json({ error: 'selectedIds must be an array of exactly 3 IDs' });
      }

      // Guard double-submit before hitting DB
      const { rows: existing } = await db.query(
        `SELECT id FROM gm_combo_attempts WHERE telegram_id = $1 AND combo_date = $2`,
        [user.id, today]
      );
      if (existing.length > 0) return res.status(409).json({ error: 'already_attempted' });

      const combo    = await getDailyCombo();
      const selected = [...selectedIds].map(Number).sort((a, b) => a - b);
      const correct  = [...combo.correctIds].sort((a, b) => a - b);
      const success  = selected.length === correct.length &&
                       selected.every((v, i) => v === correct[i]);
      const reward   = success ? Math.floor(Math.random() * 10) + 1 : 0;

      try {
        await db.query(
          `INSERT INTO gm_combo_attempts (telegram_id, combo_date, success, reward)
           VALUES ($1, $2, $3, $4)`,
          [user.id, today, success, reward]
        );
        if (success && reward > 0) {
          await db.query(
            `UPDATE gm_users SET coins = coins + $1, last_active_at = NOW()
             WHERE telegram_id = $2`,
            [reward, user.id]
          );
        }
        return res.json({ ok: true, success, reward });
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'already_attempted' });
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(405).end();
  }

  // ── GET /api/tasks (no action) → all non-hidden tasks ───────────────────────
  if (req.method !== 'GET') return res.status(405).end();

  const db = getPool();
  if (!db) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const { rows } = await db.query(
      `SELECT id, title, description, reward, is_daily
       FROM gm_tasks
       WHERE is_hidden = false
       ORDER BY created_at ASC`
    );
    res.json(rows.map(r => ({
      id:          r.id,
      title:       r.title,
      description: r.description,
      reward:      Number(r.reward),
      isDaily:     r.is_daily,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
