// POST /api/telegram/withdraw — submit withdrawal request
// Stores as pending in DB and notifies admin via Telegram.
// Admin approves via admin panel which triggers the actual TON send.
const { createHmac } = require('node:crypto');
const { Pool } = require('pg');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const ADMIN_IDS = [6145230334, 868999453];
const MIN_WITHDRAWAL = 0.1;

let pool = null;
function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}

function verifyInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (computed !== hash) return null;
    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;
    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch { return null; }
}

async function notifyTelegram(chatId, text) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-init-data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const initData = body.initData || req.headers['x-init-data'];
  const amount = Number(body.amount);

  if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData required' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (amount < MIN_WITHDRAWAL) return res.status(400).json({ error: `الحد الأدنى للسحب هو ${MIN_WITHDRAWAL} gram` });

  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'Invalid initData' });

  const db = getPool();
  if (!db) return res.status(503).json({ error: 'DB not available' });

  try {
    // Lazy migrations
    await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS wallet_address text`).catch(() => {});
    await db.query(`
      CREATE TABLE IF NOT EXISTS gm_withdrawals (
        id               serial PRIMARY KEY,
        telegram_id      bigint NOT NULL,
        wallet_address   text   NOT NULL,
        amount           double precision NOT NULL,
        status           text   NOT NULL DEFAULT 'pending',
        tx_hash          text,
        rejection_reason text,
        created_at       timestamp NOT NULL DEFAULT NOW(),
        processed_at     timestamp
      )
    `).catch(() => {});

    // Load user balance + wallet
    const { rows: userRows } = await db.query(
      `SELECT balance, wallet_address FROM gm_users WHERE telegram_id = $1`,
      [user.id]
    );
    const dbUser = userRows[0];
    if (!dbUser) return res.status(404).json({ error: 'User not found' });
    if (!dbUser.wallet_address) return res.status(400).json({ error: 'لم تربط محفظة TON بعد. اربط محفظتك أولاً.' });

    const balance = Number(dbUser.balance ?? 0);
    if (balance < amount) return res.status(400).json({ error: `الرصيد غير كافٍ (${balance.toFixed(4)} gram)` });

    // Check for pending withdrawal
    const { rows: pending } = await db.query(
      `SELECT id FROM gm_withdrawals WHERE telegram_id=$1 AND status='pending' LIMIT 1`,
      [user.id]
    );
    if (pending.length > 0) return res.status(400).json({ error: 'لديك طلب سحب معلق بالفعل. انتظر معالجته أولاً.' });

    // Deduct balance
    await db.query(
      `UPDATE gm_users SET balance = ROUND(CAST(balance AS numeric) - CAST($1 AS numeric), 6)::double precision WHERE telegram_id = $2`,
      [amount, user.id]
    );

    // Insert withdrawal record
    const { rows: insertRows } = await db.query(
      `INSERT INTO gm_withdrawals (telegram_id, wallet_address, amount) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, dbUser.wallet_address, amount]
    );
    const withdrawalId = insertRows[0]?.id;

    // Notify admins
    for (const adminId of ADMIN_IDS) {
      await notifyTelegram(
        adminId,
        `💸 <b>طلب سحب جديد #${withdrawalId}</b>\n\n` +
        `👤 ${user.first_name ?? 'Miner'} (ID: ${user.id})\n` +
        `💰 المبلغ: <b>${amount.toFixed(4)} gram</b>\n` +
        `📬 المحفظة: <code>${dbUser.wallet_address}</code>\n\n` +
        `للموافقة أو الرفض: لوحة الإدارة`
      );
    }

    return res.json({
      ok: true,
      withdrawalId,
      message: `✅ تم استلام طلب السحب (${amount.toFixed(4)} gram). سيتم معالجته قريباً.`,
    });
  } catch (err) {
    console.error('withdraw error:', err?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
