const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [total, blocked, active] = await Promise.all([
      db.query('SELECT COUNT(*) FROM gm_users'),
      db.query('SELECT COUNT(*) FROM gm_users WHERE blocked_bot = true'),
      db.query('SELECT COUNT(*) FROM gm_users WHERE last_active_at > $1', [fiveMinAgo]),
    ]);
    res.json({
      totalUsers:   Number(total.rows[0].count),
      blockedUsers: Number(blocked.rows[0].count),
      activeUsers:  Number(active.rows[0].count),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
