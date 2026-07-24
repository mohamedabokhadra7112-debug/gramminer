// POST /api/telegram/deposit/tonconnect
// User paid gram via TON Connect — credit gram balance automatically.
// body: { initData, boc, amountGram }
const { createHmac } = require('node:crypto');
const { Pool } = require('pg');

const TOKEN     = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const ADMIN_IDS = [6145230334, 868999453];

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
  const initData  = body.initData || req.headers['x-init-data'];
  const boc       = body.boc;
  const amountGram = Number(body.amountGram);

  if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData required' });
  if (!boc || typeof boc !== 'string')           return res.status(400).json({ error: 'boc required' });
  if (!Number.isFinite(amountGram) || amountGram <= 0) return res.status(400).json({ error: 'amountGram must be positive' });

  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: 'Invalid initData' });

  const db = getPool();
  if (!db) return res.status(503).json({ error: 'DB not available' });

  try {
    // Lazy migrations
    await db.query(`
      CREATE TABLE IF NOT EXISTS gm_deposits (
        id             serial PRIMARY KEY,
        telegram_id    bigint NOT NULL,
        wallet_address text   NOT NULL,
        tx_hash        text   NOT NULL UNIQUE,
        amount         double precision NOT NULL,
        status         text   NOT NULL DEFAULT 'pending',
        confirmations  integer NOT NULL DEFAULT 0,
        credited_at    timestamp,
        created_at     timestamp NOT NULL DEFAULT NOW(),
        processed_at   timestamp
      )
    `).catch(() => {});
    await db.query(`ALTER TABLE gm_deposits ADD COLUMN IF NOT EXISTS ton_boc text`).catch(() => {});

    // Use a fingerprint of the BOC as unique tx_hash to prevent double-crediting
    const bocHash = `tonconnect:${Buffer.from(boc).toString('base64').slice(0, 64)}`;

    let depositId;
    try {
      const { rows } = await db.query(
        `INSERT INTO gm_deposits (telegram_id, wallet_address, tx_hash, amount, status, confirmations, credited_at, processed_at)
         VALUES ($1, 'tonconnect', $2, $3, 'confirmed', 1, NOW(), NOW())
         RETURNING id`,
        [user.id, bocHash, amountGram]
      );
      depositId = rows[0]?.id;
    } catch (e) {
      if (e?.code === '23505') {
        return res.status(409).json({ error: 'هذه المعاملة تمت معالجتها بالفعل.' });
      }
      throw e;
    }

    // Store BOC for audit (truncated)
    db.query(`UPDATE gm_deposits SET ton_boc=$1 WHERE id=$2`, [boc.slice(0, 2000), depositId]).catch(() => {});

    // Ensure user exists then credit gram balance
    await db.query(
      `INSERT INTO gm_users (telegram_id, first_name, balance, last_active_at)
       VALUES ($1, $2, 0, NOW())
       ON CONFLICT (telegram_id) DO NOTHING`,
      [user.id, user.first_name ?? null]
    );
    const { rows: balRows } = await db.query(
      `UPDATE gm_users
       SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision,
           last_active_at = NOW()
       WHERE telegram_id = $2
       RETURNING balance`,
      [amountGram, user.id]
    );
    const newBalance = balRows[0]?.balance ?? amountGram;

    // Notify user
    await notifyTelegram(
      user.id,
      `✅ <b>تم تأكيد الإيداع!</b>\n\n💰 المبلغ: <b>${amountGram.toFixed(4)} gram</b>\n\nتم إضافة الرصيد لحسابك تلقائياً.`
    );

    // Notify admins
    for (const adminId of ADMIN_IDS) {
      await notifyTelegram(
        adminId,
        `💰 <b>إيداع TON Connect جديد #${depositId}</b>\n\n👤 ${user.first_name ?? 'Miner'} (ID: ${user.id})\n💵 المبلغ: ${amountGram.toFixed(4)} gram\n✅ مضاف تلقائياً`
      );
    }

    return res.json({
      ok: true,
      depositId,
      balance: newBalance,
      message: `✅ تم إيداع ${amountGram.toFixed(4)} gram وإضافته لرصيدك.`,
    });
  } catch (err) {
    console.error('deposit/tonconnect error:', err?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
