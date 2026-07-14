const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(chat_id, text) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const update = req.body;
  const msg = update.message;
  if (!msg) return res.status(200).json({ ok: true });

  const chat_id = msg.chat.id;
  const text = msg.text || '';
  const name = msg.from?.first_name || 'Miner';

  if (text === '/start') {
    await sendMessage(chat_id,
      `⛏️ <b>Welcome to GramMiner, ${name}!</b>\n\n` +
      `💰 Start mining GMR by tapping the coin!\n\n` +
      `🚀 Press the button below to open the app:`
    );

    // Send the Mini App button
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: '👇 Open GramMiner and start earning!',
        reply_markup: {
          inline_keyboard: [[{
            text: '⛏️ Open GramMiner',
            web_app: { url: process.env.APP_URL || 'https://your-app.vercel.app' }
          }]]
        }
      }),
    });
  } else if (text === '/balance') {
    await sendMessage(chat_id,
      `💰 <b>Your GramMiner Balance</b>\n\n` +
      `Open the app to see your full balance!\n` +
      `⛏️ Keep mining to earn more GMR!`
    );
  }

  return res.status(200).json({ ok: true });
}
