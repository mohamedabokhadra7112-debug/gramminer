const { createHmac } = require('node:crypto');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

/**
 * Verifies Telegram WebApp initData via HMAC-SHA256.
 * Returns the user object or null if invalid / expired (> 24 h).
 */
function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
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
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  try { return JSON.parse(userRaw); } catch { return null; }
}

module.exports = async function handler(req, res) {
  // CORS — allow the Mini App origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { initData } = body || {};

  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData is required' });
  }

  const user = verifyInitData(initData);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired Telegram initData' });
  }

  const isAdmin = ADMIN_ID > 0 && user.id === ADMIN_ID;

  return res.status(200).json({
    user: {
      id:         user.id,
      first_name: user.first_name,
      last_name:  user.last_name,
      username:   user.username,
      balance:    0, // no DB in this serverless handler — balance is client-side
    },
    isAdmin,
  });
};
