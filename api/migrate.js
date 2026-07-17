// One-time DB migration — creates all GramMiner tables if they don't exist.
// Call once: GET https://gramminer-api-server-nine.vercel.app/api/migrate
// Protected by ADMIN_MIGRATE_SECRET env var (or open if not set, for first run).
const { Pool } = require('pg');

module.exports = async function handler(req, res) {
  const secret = process.env.ADMIN_MIGRATE_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized — pass ?secret=YOUR_SECRET' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL env var not set' });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      -- Users table
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

      -- Settings table (key-value store)
      CREATE TABLE IF NOT EXISTS gm_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );

      -- Tasks table
      CREATE TABLE IF NOT EXISTS gm_tasks (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        reward      NUMERIC(20, 6) NOT NULL DEFAULT 0,
        is_daily    BOOLEAN NOT NULL DEFAULT FALSE,
        is_hidden   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- Mandatory channels table
      CREATE TABLE IF NOT EXISTS gm_channels (
        id               SERIAL PRIMARY KEY,
        channel_username TEXT NOT NULL,
        channel_name     TEXT NOT NULL DEFAULT '',
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.end();
    return res.json({
      ok: true,
      message: 'All tables created (or already existed). GramMiner DB is ready ✅',
      tables: ['gm_users', 'gm_settings', 'gm_tasks', 'gm_channels'],
    });
  } catch (e) {
    await pool.end().catch(() => {});
    return res.status(500).json({ error: e.message });
  }
};
