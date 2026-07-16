const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

export default async function handler(req, res) {
  if (!TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
  if (!APP_URL) return res.status(400).json({ error: 'APP_URL not set' });

  // Set webhook
  const webhookUrl = `${APP_URL}/api/webhook`;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await r.json();

  // Set bot commands
  await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: '🚀 Open GramMiner' },
        { command: 'balance', description: '💰 Check your balance' },
      ]
    }),
  });

  return res.status(200).json({ ok: true, webhook: data, webhookUrl });
}
