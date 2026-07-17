const { verifyAdmin, cors } = require('../../_auth');
const { getPool } = require('../../_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const body    = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const message = String(body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });

  const { telegramId } = req.query;

  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(telegramId), text: `⚠️ تحذير من الإدارة:\n\n${message}`, parse_mode: 'HTML' }),
  });
  const data = await r.json();
  if (!data.ok) return res.status(500).json({ error: data.description });
  res.json({ ok: true });
};
