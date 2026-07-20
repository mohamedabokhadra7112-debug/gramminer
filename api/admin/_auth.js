// Shared admin authentication helper for all /api/admin/* handlers.
// Verifies the Telegram initData and checks if the caller is the main admin
// (ADMIN_ID env var) or a sub-admin stored in gm_settings.
const { createHmac } = require('node:crypto');

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

function verifyTelegramUser(initData) {
  if (!initData || !TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash   = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const str = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secret   = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const computed = createHmac('sha256', secret).update(str).digest('hex');
    if (computed !== hash) return null;

    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;

    return JSON.parse(params.get('user') || 'null');
  } catch { return null; }
}

/**
 * Returns the admin user object (with isMainAdmin flag) or null.
 * Pass db pool to check sub-admins table.
 */
async function verifyAdmin(req, db) {
  const initData = req.headers['x-telegram-initdata'];
  const user = verifyTelegramUser(initData);
  if (!user) return null;

  if (ADMIN_ID > 0 && user.id === ADMIN_ID) return { ...user, isMainAdmin: true };

  // Check sub-admins
  if (db) {
    try {
      const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'sub_admins'`);
      const admins = rows[0] ? JSON.parse(rows[0].value) : [];
      const found = admins.find(a => a.telegramId === user.id);
      if (found) return { ...user, isMainAdmin: false, permissions: found.permissions };
    } catch {}
  }
  return null;
}

function hasPermission(admin, perm) {
  if (!admin) return false;
  if (admin.isMainAdmin) return true;
  return (admin.permissions || []).includes(perm);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-initdata');
}

module.exports = { verifyTelegramUser, verifyAdmin, hasPermission, cors };
