const { createHmac } = require('node:crypto');
const { Pool }       = require('pg');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

// Lazy pool — created once per cold start
let pool = null;
function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

/** Verifies Telegram WebApp initData (HMAC-SHA256). Returns user or null. */
function verifyInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash   = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const computed  = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computed !== hash) return null;

    const authDate = Number(params.get('auth_date'));
    // Reject tokens older than 24 h
    if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

/** Upserts user into gm_users; returns { balance, coins }. */
async function upsertUser(db, user) {
  // Ensure coins column exists (lazy migration)
  await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0`).catch(() => {});
  const { rows } = await db.query(
    `INSERT INTO gm_users (telegram_id, first_name, last_name, username, last_active_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (telegram_id) DO UPDATE
       SET first_name    = EXCLUDED.first_name,
           last_name     = EXCLUDED.last_name,
           username      = EXCLUDED.username,
           last_active_at = NOW()
     RETURNING balance, coins`,
    [user.id, user.first_name ?? null, user.last_name ?? null, user.username ?? null],
  );
  return { balance: rows[0]?.balance ?? 0, coins: rows[0]?.coins ?? 0 };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!TOKEN)                  return res.status(503).json({ error: 'BOT_TOKEN not set' });

  const body     = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const initData = body.initData;

  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData is required' });
  }

  const user = verifyInitData(initData);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired Telegram initData' });
  }

  // Try to persist / fetch balance from DB; gracefully degrade if DB unavailable
  let balance = 0;
  let coins   = 0;
  let isAdmin = ADMIN_ID > 0 && user.id === ADMIN_ID;
  try {
    const db = getPool();
    if (db) {
      ({ balance, coins } = await upsertUser(db, user));
      // Also check sub-admins stored in gm_settings (same logic as verifyAdmin in _auth.js)
      if (!isAdmin) {
        const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'sub_admins'`);
        const subAdmins = rows[0] ? JSON.parse(rows[0].value) : [];
        if (subAdmins.some(a => a.telegramId === user.id)) isAdmin = true;
      }
    }
  } catch (err) {
    console.error('DB upsert failed:', err?.message);
  }

  // ── Mandatory channel subscription check (skipped for admins) ────────────
  let notJoinedChannels = [];
  if (!isAdmin) {
    try {
      const db = getPool();
      if (db) {
        const { rows: channels } = await db.query(
          `SELECT channel_username, channel_name FROM gm_channels ORDER BY created_at`
        );
        if (channels.length > 0) {
          const checks = await Promise.all(
            channels.map(async ch => {
              try {
                const r = await fetch(
                  `https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=@${ch.channel_username}&user_id=${user.id}`
                );
                const data = await r.json();
                const st = data?.result?.status;
                if (st === 'left' || st === 'kicked') {
                  return { channelUsername: ch.channel_username, channelName: ch.channel_name };
                }
              } catch { /* Telegram API unreachable — treat as joined */ }
              return null;
            })
          );
          notJoinedChannels = checks.filter(Boolean);
        }
      }
    } catch (err) {
      console.error('Channel membership check failed:', err?.message);
    }
  }

  return res.status(200).json({
    user: {
      id:         user.id,
      first_name: user.first_name  ?? null,
      last_name:  user.last_name   ?? null,
      username:   user.username    ?? null,
      balance,
      coins,
    },
    isAdmin,
    notJoinedChannels,
  });
};
