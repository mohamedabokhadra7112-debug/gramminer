// Public tasks endpoint — no auth required
// GET /api/tasks → returns all non-hidden tasks from gm_tasks
const { getPool } = require('./admin/_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const db = getPool();
  if (!db) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const { rows } = await db.query(
      `SELECT id, title, description, reward, is_daily
       FROM gm_tasks
       WHERE is_hidden = false
       ORDER BY created_at ASC`
    );
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      reward: Number(r.reward),
      isDaily: r.is_daily,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
