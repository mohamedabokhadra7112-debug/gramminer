const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const WEBHOOK_URL = 'https://gramminer-api-server-nine.vercel.app/api/webhook';

module.exports = async function handler(req, res) {
  if (!TOKEN) {
    return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN or BOT_TOKEN env var is not set' });
  }

  // Register the webhook
  const webhookRes = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const webhookData = await webhookRes.json();

  // Set bot commands
  await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start',   description: '🚀 Open GramMiner' },
        { command: 'balance', description: '💰 Check your balance' },
      ],
    }),
  });

  return res.status(200).json({ ok: true, webhook: webhookData, webhookUrl: WEBHOOK_URL });
};
