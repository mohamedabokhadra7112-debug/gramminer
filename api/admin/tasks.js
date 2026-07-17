const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { rows } = await db.query('SELECT * FROM gm_tasks ORDER BY created_at DESC');
    return res.json(rows.map(r => ({
      id: r.id, title: r.title, description: r.description,
      reward: r.reward, isDaily: r.is_daily, isHidden: r.is_hidden,
    })));
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { title, description = '', reward = 0, isDaily = false } = body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await db.query(
      `INSERT INTO gm_tasks (title, description, reward, is_daily) VALUES ($1,$2,$3,$4) RETURNING *`,
      [title, description, Number(reward), Boolean(isDaily)]
    );
    const r = rows[0];
    return res.json({ id: r.id, title: r.title, description: r.description, reward: r.reward, isDaily: r.is_daily, isHidden: r.is_hidden });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
