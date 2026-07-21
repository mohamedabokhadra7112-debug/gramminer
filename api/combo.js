// Daily Combo endpoint
// GET  /api/combo          — today's status for the current user (no correct-IDs revealed)
// POST /api/combo?action=submit  body: { selectedIds: [x,y,z] }
const { verifyTelegramUser, cors } = require('./admin/_auth');
const { getPool } = require('./admin/_db');

const COMBO_ITEMS = [
  { id: 1, name: 'Crystal Core'   },
  { id: 2, name: 'Mining Pickaxe' },
  { id: 3, name: 'Mining Rig'     },
  { id: 4, name: 'Server Node'    },
  { id: 5, name: 'Treasure Vault' },
];

function todayDate() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function ensureTable(db) {
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
}

async function getDailyCombo(db) {
  const today = todayDate();
  const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'daily_combo'`);
  if (rows.length > 0) {
    try {
      const parsed = JSON.parse(rows[0].value);
      if (parsed.date === today) return parsed;
    } catch (_) { /* fall through to generate */ }
  }
  // Generate a new random combo of 3 from 5
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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const initData = req.headers['x-telegram-initdata'] || req.headers['x-init-data'];
  if (!initData || !TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const user = verifyTelegramUser(initData);
  if (!user) return res.status(401).json({ error: 'Invalid initData' });

  const db = getPool();
  if (!db) return res.status(503).json({ error: 'DATABASE_URL not configured' });

  await ensureTable(db);

  const today = todayDate();
  const combo = await getDailyCombo(db);

  // ── GET — return items + today's attempt status ────────────────────────────
  if (req.method === 'GET') {
    const { rows } = await db.query(
      `SELECT success, reward FROM gm_combo_attempts
       WHERE telegram_id = $1 AND combo_date = $2`,
      [user.id, today]
    );
    const attempt = rows[0] || null;
    return res.json({
      items:         COMBO_ITEMS,
      attemptedToday: !!attempt,
      success:        attempt ? attempt.success : null,
      reward:         attempt ? attempt.reward  : null,
    });
  }

  // ── POST?action=submit ────────────────────────────────────────────────────
  if (req.method === 'POST' && req.query.action === 'submit') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { selectedIds } = body;

    if (!Array.isArray(selectedIds) || selectedIds.length !== 3) {
      return res.status(400).json({ error: 'selectedIds must be an array of exactly 3 IDs' });
    }

    // Guard against double-submit (DB unique constraint is backup)
    const { rows: existing } = await db.query(
      `SELECT id FROM gm_combo_attempts WHERE telegram_id = $1 AND combo_date = $2`,
      [user.id, today]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'already_attempted' });

    const selected = [...selectedIds].map(Number).sort((a, b) => a - b);
    const correct  = [...combo.correctIds].sort((a, b) => a - b);
    const success  = selected.length === correct.length &&
                     selected.every((v, i) => v === correct[i]);

    const reward = success ? Math.floor(Math.random() * 10) + 1 : 0;

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

  res.status(400).json({ error: 'Invalid request' });
};
