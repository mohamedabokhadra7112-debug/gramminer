const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

async function sendTg(chatId, text, parseMode = 'HTML') {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

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
      // Small delay to respect Telegram rate limits
      await new Promise(r => setTimeout(r, 50));
    }
    res.json({ ok: true, sent, failed, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
