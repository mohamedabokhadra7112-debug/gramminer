const { verifyAdmin, cors } = require('../_auth');
const { getPool } = require('../_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'DELETE') {
    await db.query('DELETE FROM gm_channels WHERE id = $1', [Number(req.query.id)]);
    return res.json({ ok: true });
  }
  res.status(405).json({ error: 'Method not allowed' });
};
