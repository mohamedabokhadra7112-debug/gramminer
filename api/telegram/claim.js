const { createHmac } = require('node:crypto');
const { Pool }       = require('pg');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const MAX_CLAIM = 100_000; // sanity cap per claim

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
    if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
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
  const amount   = Number(body.amount);

  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData is required' });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_CLAIM) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const user = verifyInitData(initData);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired Telegram initData' });
  }

  const db = getPool();
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    // Ensure the user row exists first (first-time claimer who skipped /auth)
    await db.query(
      `INSERT INTO gm_users (telegram_id, first_name, last_name, username, last_active_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (telegram_id) DO UPDATE SET last_active_at = NOW()`,
      [user.id, user.first_name ?? null, user.last_name ?? null, user.username ?? null],
    );

    // Add the claimed amount to their balance
    const { rows } = await db.query(
      `UPDATE gm_users
       SET balance = balance + $2, last_active_at = NOW()
       WHERE telegram_id = $1
       RETURNING balance`,
      [user.id, amount],
    );

    return res.status(200).json({ balance: rows[0]?.balance ?? amount });
  } catch (err) {
    console.error('Claim DB error:', err?.message);
    return res.status(500).json({ error: 'Failed to persist claim' });
  }
};
