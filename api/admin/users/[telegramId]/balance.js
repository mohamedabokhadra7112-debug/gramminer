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
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Invalid amount' });

  const { telegramId } = req.query;
  const { rows } = await db.query(
    `UPDATE gm_users SET balance = GREATEST(0, balance + $1), last_active_at = NOW()
     WHERE telegram_id = $2 RETURNING balance`,
    [amount, Number(telegramId)]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true, balance: rows[0].balance });
};
