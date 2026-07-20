const TOKEN    = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const API      = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const APP_URL  = 'https://gramminer-api-server-nine.vercel.app';

const { getPool } = require('./admin/_db');

async function sendMessage(chat_id, text, extra = {}) {
  const r = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', ...extra }),
  });
  return r.json().catch(() => null);
}

/** جيب قيمة key من جدول gm_settings، رجّع null لو مفيش DB أو مفيش القيمة */
async function getSetting(key) {
  try {
    const pool = getPool();
    if (!pool) return null;
    const { rows } = await pool.query(
      'SELECT value FROM gm_settings WHERE key = $1 LIMIT 1',
      [key]
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Only accept POST from Telegram
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  if (!TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN / BOT_TOKEN is not set');
    return res.status(200).json({ ok: true });
  }

  // Parse body — Vercel pre-parses JSON, but guard against raw strings
  let update = req.body;
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch { return res.status(200).json({ ok: true }); }
  }
  if (!update) return res.status(200).json({ ok: true });

  // ── message handler ────────────────────────────────────────────────────────
  const msg = update.message;
  if (msg) {
    const chat_id = msg.chat.id;
    const text    = msg.text || '';
    const name    = msg.from?.first_name || 'Miner';
    const isAdmin = ADMIN_ID && msg.from?.id === ADMIN_ID;

    if (text === '/start' || text.startsWith('/start ')) {
      // اقرأ وضع الصيانة ورسالة الترحيب من الداتابيز
      const [maintenanceMode, maintenanceMsg, welcomeMsg] = await Promise.all([
        getSetting('maintenance_mode'),
        getSetting('maintenance_message'),
        getSetting('welcome_message'),
      ]);

      const isMaintenance = maintenanceMode === 'true';

      if (isMaintenance && !isAdmin) {
        // وضع الصيانة — ارسل رسالة الصيانة بدون زر التطبيق
        await sendMessage(
          chat_id,
          maintenanceMsg || '🔧 البوت تحت الصيانة حالياً، سيعود قريباً!'
        );
      } else {
        // وضع عادي — استخدم welcome_message من الداتابيز أو نص افتراضي
        const welcome = welcomeMsg
          ? welcomeMsg.replace('{first_name}', name)
          : `⛏️ <b>Welcome to GramMiner, ${name}!</b>\n\n` +
            `💰 Start mining gram by tapping the coin!\n` +
            `🏆 Compete with friends and earn rewards!\n\n` +
            `👇 Press the button below to start:`;

        await sendMessage(chat_id, welcome, {
          reply_markup: {
            inline_keyboard: [[
              { text: '⛏️ Open GramMiner', web_app: { url: APP_URL } },
            ]],
          },
        });
      }

    } else if (text === '/balance') {
      await sendMessage(
        chat_id,
        `💰 <b>Your GramMiner Balance</b>\n\n` +
        `Open the app to see your full balance!\n` +
        `⛏️ Keep mining to earn more gram!`
      );

    } else if (isAdmin && text === '/admin') {
      await sendMessage(
        chat_id,
        `👑 <b>Admin Panel — GramMiner</b>\n\n` +
        `الأوامر المتاحة:\n` +
        `📢 /broadcast [رسالة] — ارسل رسالة لكل المستخدمين\n` +
        `📊 /stats — إحصائيات البوت\n` +
        `⚙️ /setup — إعادة ضبط الويب هوك`
      );

    } else if (isAdmin && text === '/stats') {
      await sendMessage(
        chat_id,
        `📊 <b>GramMiner Stats</b>\n\n` +
        `🤖 Bot: GramMiner\n💎 Token: gram\n✅ Status: Running\n👑 Admin: ${ADMIN_ID}`
      );

    } else if (isAdmin && text.startsWith('/broadcast ')) {
      const broadcastMsg = text.replace('/broadcast ', '');
      await sendMessage(
        chat_id,
        `📢 <b>Broadcast:</b> ${broadcastMsg}\n\n⚠️ يحتاج قاعدة بيانات لإرسال للكل`
      );

    } else if (!isAdmin && (text === '/admin' || text.startsWith('/broadcast'))) {
      await sendMessage(chat_id, `❌ مش مسموحلك بالأمر ده!`);
    }
  }

  return res.status(200).json({ ok: true });
};
