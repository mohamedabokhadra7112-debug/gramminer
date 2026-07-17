// Consolidated: tasks list/create + tasks delete/patch
// GET             → list tasks
// POST            { title, description, reward, isDaily } → create
// DELETE ?id=X    → delete task
// PATCH  ?id=X    { ...fields } → update task
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

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.query('DELETE FROM gm_tasks WHERE id = $1', [Number(id)]);
    return res.json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const fields = [], vals = [];
    let idx = 1;
    if (body.title       !== undefined) { fields.push(`title=$${idx++}`);       vals.push(body.title); }
    if (body.description !== undefined) { fields.push(`description=$${idx++}`); vals.push(body.description); }
    if (body.reward      !== undefined) { fields.push(`reward=$${idx++}`);      vals.push(Number(body.reward)); }
    if (body.isDaily     !== undefined) { fields.push(`is_daily=$${idx++}`);    vals.push(Boolean(body.isDaily)); }
    if (body.isHidden    !== undefined) { fields.push(`is_hidden=$${idx++}`);   vals.push(Boolean(body.isHidden)); }
    if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(Number(id));
    await db.query(`UPDATE gm_tasks SET ${fields.join(',')} WHERE id=$${idx}`, vals);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
