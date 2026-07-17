const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query('SELECT key, value FROM gm_settings');
      const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
      res.json(settings);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { key, value } = body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      await db.query(
        `INSERT INTO gm_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value ?? '')]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
