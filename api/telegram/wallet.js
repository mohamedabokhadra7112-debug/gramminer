// POST /api/telegram/wallet  — save wallet address
// DELETE /api/telegram/wallet — remove wallet address
const { createHmac } = require('node:crypto');
const { Pool } = require('pg');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

let pool = null;
function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}

function verifyInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (computed !== hash) return null;
    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;
    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const { initData } = body;
  if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData required' });

  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'Invalid initData' });

  const db = getPool();
  if (!db) return res.status(503).json({ error: 'DB not available' });

  try {
    await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS wallet_address text`).catch(() => {});

    if (req.method === 'DELETE') {
      await db.query(`UPDATE gm_users SET wallet_address = NULL WHERE telegram_id = $1`, [user.id]);
      return res.json({ ok: true });
    }

    if (req.method === 'POST') {
      const { address } = body;
      if (!address || typeof address !== 'string') return res.status(400).json({ error: 'address required' });

      // Check if address is already taken by another account
      const { rows } = await db.query(
        `SELECT telegram_id FROM gm_users WHERE wallet_address = $1 AND telegram_id != $2 LIMIT 1`,
        [address, user.id]
      );
      if (rows.length > 0) {
        return res.status(409).json({ message: 'هذا العنوان مرتبط بحساب آخر بالفعل' });
      }

      await db.query(
        `INSERT INTO gm_users (telegram_id, first_name, wallet_address, last_active_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (telegram_id) DO UPDATE SET wallet_address = $3, last_active_at = NOW()`,
        [user.id, user.first_name ?? null, address]
      );
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('wallet handler error:', err?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
