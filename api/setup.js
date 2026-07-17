// Unified setup: webhook registration + DB migration + task seeding
// GET /api/setup           → setup webhook only
// GET /api/setup?migrate=1 → setup webhook + create tables + seed default tasks
const { Pool } = require('pg');

const TOKEN       = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const WEBHOOK_URL = 'https://gramminer-api-server-nine.vercel.app/api/webhook';

const DEFAULT_TASKS = [
  { title: 'انضم لقناتنا على تيليجرام',  description: 'تابع قناتنا الرسمية للحصول على آخر الأخبار',  reward: 50  },
  { title: 'تابعنا على تويتر / X',        description: 'تابع حسابنا الرسمي على منصة X',               reward: 50  },
  { title: 'ادعُ 3 أصدقاء',               description: 'شارك الرابط الخاص بك واحصل على مكافأتك',     reward: 200 },
  { title: 'سجّل الدخول يومياً',          description: 'افتح التطبيق كل يوم للحصول على مكافأة يومية', reward: 10  },
  { title: 'ابدأ تعدين GMR',              description: 'اشترِ أول ماينر لك وابدأ رحلة التعدين',       reward: 500 },
];

module.exports = async function handler(req, res) {
  if (!TOKEN) {
    return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN or BOT_TOKEN env var is not set' });
  }

  const results = {};

  // ── 1. Register webhook ───────────────────────────────────────────────────
  try {
    const webhookRes = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: WEBHOOK_URL, allowed_updates: ['message', 'callback_query'] }),
    });
    results.webhook = await webhookRes.json();
  } catch (e) {
    results.webhook = { error: e.message };
  }

  // ── 2. Set bot commands ───────────────────────────────────────────────────
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start',   description: '🚀 Open GramMiner' },
          { command: 'balance', description: '💰 Check your balance' },
        ],
      }),
    });
    results.commands = 'ok';
  } catch (e) {
    results.commands = { error: e.message };
  }

  // ── 3. DB migration + seeding (only when ?migrate=1) ─────────────────────
  if (req.query.migrate === '1') {
    if (!process.env.DATABASE_URL) {
      results.migrate = { error: 'DATABASE_URL not set' };
    } else {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS gm_users (
            id                  SERIAL PRIMARY KEY,
            telegram_id         BIGINT UNIQUE NOT NULL,
            username            TEXT,
            first_name          TEXT,
            last_name           TEXT,
            balance             NUMERIC(20, 6) NOT NULL DEFAULT 0,
            is_banned           BOOLEAN NOT NULL DEFAULT FALSE,
            restrict_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
            blocked_bot         BOOLEAN NOT NULL DEFAULT FALSE,
            referral_by         BIGINT,
            last_active_at      TIMESTAMPTZ DEFAULT NOW(),
            created_at          TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS gm_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
          );
          CREATE TABLE IF NOT EXISTS gm_tasks (
            id          SERIAL PRIMARY KEY,
            title       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            reward      NUMERIC(20, 6) NOT NULL DEFAULT 0,
            is_daily    BOOLEAN NOT NULL DEFAULT FALSE,
            is_hidden   BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS gm_channels (
            id               SERIAL PRIMARY KEY,
            channel_username TEXT NOT NULL,
            channel_name     TEXT NOT NULL DEFAULT '',
            created_at       TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        // Seed default tasks only if table is empty
        const { rows } = await pool.query('SELECT COUNT(*) FROM gm_tasks');
        if (Number(rows[0].count) === 0) {
          for (const t of DEFAULT_TASKS) {
            await pool.query(
              `INSERT INTO gm_tasks (title, description, reward) VALUES ($1, $2, $3)`,
              [t.title, t.description, t.reward]
            );
          }
          results.migrate = { tables: 'created', tasks: `${DEFAULT_TASKS.length} default tasks seeded` };
        } else {
          results.migrate = { tables: 'already exist', tasks: 'skipped (table not empty)' };
        }
        await pool.end();
      } catch (e) {
        await pool.end().catch(() => {});
        results.migrate = { error: e.message };
      }
    }
  }

  return res.status(200).json({ ok: true, webhookUrl: WEBHOOK_URL, ...results });
};
