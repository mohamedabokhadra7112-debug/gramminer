// Consolidated: stats + settings + broadcast
// GET  ?type=stats
// GET  ?type=settings
// POST ?type=settings  { key, value }
// POST ?type=broadcast { message }
const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

async function sendTg(chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const type = req.query.type;

  // ── Stats ──────────────────────────────────────────────────────────────
  if (type === 'stats' && req.method === 'GET') {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const [total, blocked, active] = await Promise.all([
        db.query('SELECT COUNT(*) FROM gm_users'),
        db.query('SELECT COUNT(*) FROM gm_users WHERE blocked_bot = true'),
        db.query('SELECT COUNT(*) FROM gm_users WHERE last_active_at > $1', [fiveMinAgo]),
      ]);
      return res.json({
        totalUsers:   Number(total.rows[0].count),
        blockedUsers: Number(blocked.rows[0].count),
        activeUsers:  Number(active.rows[0].count),
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── Settings GET ────────────────────────────────────────────────────────
  if (type === 'settings' && req.method === 'GET') {
    try {
      const { rows } = await db.query('SELECT key, value FROM gm_settings');
      return res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── Settings POST ───────────────────────────────────────────────────────
  if (type === 'settings' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { key, value } = body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      await db.query(
        `INSERT INTO gm_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value ?? '')]
      );
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── Broadcast ───────────────────────────────────────────────────────────
  if (type === 'broadcast' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { message } = body || {};
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });
    try {
      const { rows } = await db.query(
        `SELECT telegram_id FROM gm_users WHERE blocked_bot = false OR blocked_bot IS NULL`
      );
      let sent = 0, failed = 0;
      for (const row of rows) {
        const ok = await sendTg(row.telegram_id, message);
        ok ? sent++ : failed++;
        await new Promise(r => setTimeout(r, 50));
      }
      return res.json({ ok: true, sent, failed, total: rows.length });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  res.status(400).json({ error: 'Invalid type or method' });
};
