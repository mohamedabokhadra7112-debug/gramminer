const { verifyAdmin, cors } = require('../_auth');
const { getPool } = require('../_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.query;

  if (req.method === 'DELETE') {
    await db.query('DELETE FROM gm_tasks WHERE id = $1', [Number(id)]);
    return res.json({ ok: true });
  }

  if (req.method === 'PATCH') {
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
