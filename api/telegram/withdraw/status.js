// GET /api/telegram/withdraw/status — user's withdrawal history
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-init-data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!TOKEN) return res.json([]);

  const initData = req.headers['x-init-data'];
  if (!initData) return res.json([]);
  const user = verifyInitData(initData);
  if (!user) return res.json([]);

  const db = getPool();
  if (!db) return res.json([]);

  try {
    const { rows } = await db.query(
      `SELECT id, amount, status, tx_hash, rejection_reason, created_at, processed_at
       FROM gm_withdrawals WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [user.id]
    );
    return res.json(rows);
  } catch {
    return res.json([]);
  }
};
