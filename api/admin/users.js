// Consolidated: user search + balance + ban + restrict + warn
// GET    ?action=search&q=X                     → search users
// POST   ?action=balance&id=X  { amount }       → adjust balance (delta)
// POST   ?action=balance_set&id=X  { value }    → set balance to exact value
// POST   ?action=ban&id=X      { ban }          → ban/unban
// POST   ?action=restrict&id=X { restrict }     → restrict withdrawal
// POST   ?action=warn&id=X     { message }      → send warning message
// DELETE ?id=X                                  → delete user row from gm_users
const { verifyAdmin, cors } = require('./_auth');
const { getPool } = require('./_db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getPool();
  const admin = await verifyAdmin(req, db);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const { action, q } = req.query;
  // Accept both ?id= (frontend) and ?telegramId= (legacy) for compatibility
  const telegramId = req.query.id || req.query.telegramId;

  // ── Search ──────────────────────────────────────────────────────────────
  if (action === 'search' && req.method === 'GET') {
    const query = String(q || '').trim();
    if (!query) return res.json([]);
    try {
      const { rows } = await db.query(
        `SELECT id, telegram_id, username, first_name, last_name, balance, is_banned, restrict_withdrawal, blocked_bot
         FROM gm_users
         WHERE telegram_id::text = $1
            OR username ILIKE $2
            OR first_name ILIKE $2
         LIMIT 20`,
        [query, `%${query}%`]
      );
      return res.json(rows.map(u => ({
        id: u.id, telegramId: u.telegram_id, username: u.username,
        firstName: u.first_name, lastName: u.last_name,
        balance: u.balance, isBanned: u.is_banned,
        restrictWithdrawal: u.restrict_withdrawal, blockedBot: u.blocked_bot,
      })));
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── Balance adjustment (delta) ──────────────────────────────────────────
  if (action === 'balance' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Invalid amount' });
    const { rows } = await db.query(
      `UPDATE gm_users SET balance = GREATEST(0, balance + $1), last_active_at = NOW()
       WHERE telegram_id = $2 RETURNING balance`,
      [amount, Number(telegramId)]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true, balance: rows[0].balance });
  }

  // ── Balance set (exact value) ───────────────────────────────────────────
  if (action === 'balance_set' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const value = Number(body?.value);
    if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Invalid value' });
    const { rows } = await db.query(
      `UPDATE gm_users SET balance = $1, last_active_at = NOW()
       WHERE telegram_id = $2 RETURNING balance`,
      [value, Number(telegramId)]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true, balance: rows[0].balance });
  }

  // ── Ban / Unban ─────────────────────────────────────────────────────────
  if (action === 'ban' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const ban = Boolean(body?.ban);
    await db.query('UPDATE gm_users SET is_banned = $1 WHERE telegram_id = $2', [ban, Number(telegramId)]);
    return res.json({ ok: true, isBanned: ban });
  }

  // ── Restrict withdrawal ─────────────────────────────────────────────────
  if (action === 'restrict' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const restrict = Boolean(body?.restrict);
    await db.query('UPDATE gm_users SET restrict_withdrawal = $1 WHERE telegram_id = $2', [restrict, Number(telegramId)]);
    return res.json({ ok: true, restrictWithdrawal: restrict });
  }

  // ── Send warning ────────────────────────────────────────────────────────
  if (action === 'warn' && req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const message = String(body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message required' });
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(telegramId), text: `⚠️ تحذير من الإدارة:\n\n${message}`, parse_mode: 'HTML' }),
    });
    const data = await r.json();
    if (!data.ok) return res.status(500).json({ error: data.description });
    return res.json({ ok: true });
  }

  // ── Delete user ─────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!telegramId) return res.status(400).json({ error: 'id required' });
    const { rowCount } = await db.query(
      `DELETE FROM gm_users WHERE telegram_id = $1`,
      [Number(telegramId)]
    );
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true });
  }

  res.status(400).json({ error: 'Invalid action or method' });
};
