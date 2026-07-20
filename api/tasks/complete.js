// POST /api/tasks/complete
// Body: { initData, taskId }
// Verifies the caller's Telegram identity, checks task eligibility,
// optionally checks channel membership, records the completion, and
// credits the task reward as coins to the user's account.
const { verifyTelegramUser, cors } = require('../admin/_auth');
const { getPool } = require('../admin/_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    // ── Ensure schema ────────────────────────────────────────────────────────
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

    // ── Load task ────────────────────────────────────────────────────────────
    const { rows: taskRows } = await db.query(
      `SELECT id, title, reward, is_hidden, channel_username FROM gm_tasks WHERE id = $1`,
      [Number(taskId)]
    );
    if (!taskRows.length || taskRows[0].is_hidden) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskRows[0];

    // ── Already completed? ───────────────────────────────────────────────────
    const { rows: existing } = await db.query(
      `SELECT id FROM gm_task_completions WHERE telegram_id = $1 AND task_id = $2`,
      [user.id, task.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'already_completed' });
    }

    // ── Channel membership check ─────────────────────────────────────────────
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
        // If Telegram API is unreachable, allow through to avoid blocking users
      }
    }

    // ── Record completion ────────────────────────────────────────────────────
    await db.query(
      `INSERT INTO gm_task_completions (telegram_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, task.id]
    );

    // ── Credit reward as coins ───────────────────────────────────────────────
    const reward = Math.round(Number(task.reward) || 0);
    const { rows: updated } = await db.query(
      `UPDATE gm_users
          SET coins = coins + $1, last_active_at = NOW()
        WHERE telegram_id = $2
        RETURNING coins`,
      [reward, user.id]
    );

    return res.json({ ok: true, reward, coins: updated[0]?.coins ?? 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
