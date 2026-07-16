const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = 868999453;
const APP_URL = 'https://gramminer-api-server-nine.vercel.app';

async function sendMessage(chat_id, text, extra = {}) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', ...extra }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  // Parse body — Vercel provides it pre-parsed for JSON content-type,
  // but guard against the raw-string edge case just in case.
  let update = req.body;
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch { return res.status(200).json({ ok: true }); }
  }
  if (!update) return res.status(200).json({ ok: true });

  const msg = update.message;
  if (!msg) return res.status(200).json({ ok: true });

  const chat_id = msg.chat.id;
  const text    = msg.text || '';
  const name    = msg.from?.first_name || 'Miner';
  const isAdmin = msg.from?.id === ADMIN_ID;

  // ── General commands ──────────────────────────────────────────────────────
  if (text === '/start') {
    // Welcome message
    await sendMessage(
      chat_id,
      `⛏️ <b>Welcome to GramMiner, ${name}!</b>\n\n` +
      `💰 Start mining GMR by tapping the coin!\n` +
      `🏆 Compete with friends and earn rewards!\n\n` +
      `👇 Press the button below to start:`
    );

    // Inline keyboard with Web App button
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: '🚀 Open GramMiner and start earning GMR!',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '⛏️ Open GramMiner',
              web_app: { url: APP_URL },
            },
          ]],
        },
      }),
    });
  }

  else if (text === '/balance') {
    await sendMessage(
      chat_id,
      `💰 <b>Your GramMiner Balance</b>\n\n` +
      `Open the app to see your full balance!\n` +
      `⛏️ Keep mining to earn more GMR!`
    );
  }

  // ── Admin commands ────────────────────────────────────────────────────────
  else if (isAdmin && text === '/admin') {
    await sendMessage(
      chat_id,
      `👑 <b>Admin Panel — GramMiner</b>\n\n` +
      `الأوامر المتاحة:\n` +
      `📢 /broadcast [رسالة] — ارسل رسالة لكل المستخدمين\n` +
      `📊 /stats — إحصائيات البوت\n` +
      `⚙️ /setup — إعادة ضبط الويب هوك`
    );
  }

  else if (isAdmin && text === '/stats') {
    await sendMessage(
      chat_id,
      `📊 <b>GramMiner Stats</b>\n\n` +
      `🤖 Bot: GramMiner\n` +
      `💎 Token: GMR\n` +
      `✅ Status: Running\n` +
      `👑 Admin ID: ${ADMIN_ID}`
    );
  }

  else if (isAdmin && text.startsWith('/broadcast ')) {
    const broadcastMsg = text.replace('/broadcast ', '');
    await sendMessage(
      chat_id,
      `📢 <b>Broadcast Message Sent!</b>\n\n` +
      `Message: ${broadcastMsg}\n\n` +
      `⚠️ Note: يحتاج قاعدة بيانات لإرسال لكل المستخدمين`
    );
  }

  else if (!isAdmin && (text === '/admin' || text.startsWith('/broadcast'))) {
    await sendMessage(chat_id, `❌ مش مسموحلك بالأمر ده!`);
  }

  return res.status(200).json({ ok: true });
};
