const { verifyAdmin, cors } = require('../_auth');
const { getPool } = require('../_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);

  try {
    const { rows } = await db.query(
      `SELECT id, telegram_id, username, first_name, last_name, balance, is_banned, restrict_withdrawal, blocked_bot
       FROM gm_users
       WHERE telegram_id::text = $1
          OR username ILIKE $2
          OR first_name ILIKE $2
       LIMIT 20`,
      [q, `%${q}%`]
    );
    res.json(rows.map(u => ({
      id: u.id, telegramId: u.telegram_id, username: u.username,
      firstName: u.first_name, lastName: u.last_name,
      balance: u.balance, isBanned: u.is_banned,
      restrictWithdrawal: u.restrict_withdrawal, blockedBot: u.blocked_bot,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
