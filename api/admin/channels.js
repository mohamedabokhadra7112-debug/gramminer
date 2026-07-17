// Consolidated: channels list/create + channel delete
// GET             → list channels
// POST            { channelUsername, channelName } → add channel
// DELETE ?id=X    → delete channel
const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { rows } = await db.query('SELECT * FROM gm_channels ORDER BY created_at');
    return res.json(rows.map(r => ({ id: r.id, channelUsername: r.channel_username, channelName: r.channel_name })));
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { channelUsername, channelName = '' } = body || {};
    if (!channelUsername) return res.status(400).json({ error: 'channelUsername required' });
    const clean = channelUsername.replace(/^@/, '');
    const { rows } = await db.query(
      `INSERT INTO gm_channels (channel_username, channel_name) VALUES ($1,$2) RETURNING *`,
      [clean, channelName]
    );
    const r = rows[0];
    return res.json({ id: r.id, channelUsername: r.channel_username, channelName: r.channel_name });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.query('DELETE FROM gm_channels WHERE id = $1', [Number(id)]);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
