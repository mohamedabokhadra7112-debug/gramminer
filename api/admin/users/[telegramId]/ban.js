const { verifyAdmin, cors } = require('../../_auth');
const { getPool } = require('../../_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const ban  = Boolean(body?.ban);
  const { telegramId } = req.query;

  await db.query('UPDATE gm_users SET is_banned = $1 WHERE telegram_id = $2', [ban, Number(telegramId)]);
  res.json({ ok: true, isBanned: ban });
};
