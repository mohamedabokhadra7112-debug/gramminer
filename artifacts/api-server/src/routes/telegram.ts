import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_ID = 868999453;

function getBotConfig() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const appUrl = process.env["APP_URL"];
  return { token, appUrl };
}

async function sendMessage(
  token: string,
  chat_id: number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "HTML", ...extra }),
  });
}

// Registers the Telegram webhook + bot commands for the GramMiner bot.
router.get("/telegram/setup", async (_req, res) => {
  const { token, appUrl } = getBotConfig();
  if (!token) {
    res.status(400).json({ error: "TELEGRAM_BOT_TOKEN not set" });
    return;
  }
  if (!appUrl) {
    res.status(400).json({ error: "APP_URL not set" });
    return;
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await r.json();

  await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "🚀 Open GramMiner" },
        { command: "balance", description: "💰 Check your balance" },
      ],
    }),
  });

  res.status(200).json({ ok: true, webhook: data, webhookUrl });
});

// Handles incoming Telegram bot updates.
router.post("/telegram/webhook", async (req, res) => {
  const { token, appUrl } = getBotConfig();
  if (!token) {
    res.status(200).json({ ok: true });
    return;
  }

  const update = req.body;
  const msg = update?.message;
  if (!msg) {
    res.status(200).json({ ok: true });
    return;
  }

  const chat_id = msg.chat.id;
  const text: string = msg.text || "";
  const name = msg.from?.first_name || "Miner";
  const isAdmin = msg.from?.id === ADMIN_ID;

  try {
    if (text === "/start") {
      await sendMessage(
        token,
        chat_id,
        `⛏️ <b>Welcome to GramMiner, ${name}!</b>\n\n` +
          `💰 Start mining GMR by tapping the coin!\n` +
          `🏆 Compete with friends and earn rewards!\n\n` +
          `👇 Press the button below to start:`,
      );
      await sendMessage(token, chat_id, "🚀 Open GramMiner and start earning GMR!", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⛏️ Open GramMiner",
                web_app: { url: appUrl || "https://your-app.replit.app" },
              },
            ],
          ],
        },
      });
    } else if (text === "/balance") {
      await sendMessage(
        token,
        chat_id,
        `💰 <b>Your GramMiner Balance</b>\n\n` +
          `Open the app to see your full balance!\n` +
          `⛏️ Keep mining to earn more GMR!`,
      );
    } else if (isAdmin && text === "/admin") {
      await sendMessage(
        token,
        chat_id,
        `👑 <b>Admin Panel — GramMiner</b>\n\n` +
          `الأوامر المتاحة:\n` +
          `📢 /broadcast [رسالة] — ارسل رسالة لكل المستخدمين\n` +
          `📊 /stats — إحصائيات البوت\n` +
          `⚙️ /setup — إعادة ضبط الويب هوك`,
      );
    } else if (isAdmin && text === "/stats") {
      await sendMessage(
        token,
        chat_id,
        `📊 <b>GramMiner Stats</b>\n\n` +
          `🤖 Bot: GramMiner\n` +
          `💎 Token: GMR\n` +
          `✅ Status: Running\n` +
          `👑 Admin ID: ${ADMIN_ID}`,
      );
    } else if (isAdmin && text.startsWith("/broadcast ")) {
      const broadcastMsg = text.replace("/broadcast ", "");
      await sendMessage(
        token,
        chat_id,
        `📢 <b>Broadcast Message Sent!</b>\n\n` + `Message: ${broadcastMsg}`,
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to handle Telegram webhook update");
  }

  res.status(200).json({ ok: true });
});

export default router;
