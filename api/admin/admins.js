// Sub-admin management — only the main admin (ADMIN_ID) can add/remove sub-admins.
// Sub-admins are stored as JSON array in gm_settings key 'sub_admins'.
const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin?.isMainAdmin) return res.status(403).json({ error: 'Only main admin' });

  const getSubs = async () => {
    const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'sub_admins'`);
    return rows[0] ? JSON.parse(rows[0].value) : [];
  };
  const saveSubs = async (subs) => {
    await db.query(
      `INSERT INTO gm_settings (key, value) VALUES ('sub_admins', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(subs)]
    );
  };

  if (req.method === 'GET') {
    return res.json(await getSubs());
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { telegramId, username = '', permissions = [] } = body || {};
    if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
    const subs = await getSubs();
    if (subs.find(s => s.telegramId === Number(telegramId))) {
      // Update permissions
      const idx = subs.findIndex(s => s.telegramId === Number(telegramId));
      subs[idx].permissions = permissions;
    } else {
      subs.push({ telegramId: Number(telegramId), username, permissions });
    }
    await saveSubs(subs);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { telegramId } = req.query;
    const subs = (await getSubs()).filter(s => s.telegramId !== Number(telegramId));
    await saveSubs(subs);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
