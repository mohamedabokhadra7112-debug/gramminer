import { createHmac } from "node:crypto";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_ID = 868999453;

function getBotConfig() {
  const token = process.env["BOT_TOKEN"];
  const appUrl = process.env["APP_URL"];
  return { token, appUrl };
}

type TelegramAuthUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

// Validates Telegram WebApp `initData` per Telegram's documented HMAC scheme,
// so we only ever trust user info that genuinely came from Telegram — not
// whatever a client claims. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verifyInitData(
  initData: string,
  token: string,
): TelegramAuthUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) return null;

  // Telegram sends `auth_date`; reject stale init data (older than 24h) to
  // limit replay of a leaked initData string.
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw) as TelegramAuthUser;
  } catch {
    return null;
  }
}

// Simple in-memory cache for avatar file paths to avoid hitting Telegram's
// API on every image request (the file_path Telegram returns is stable for
// a given photo).
const avatarFilePathCache = new Map<number, { filePath: string | null; expiresAt: number }>();
const AVATAR_CACHE_TTL_MS = 10 * 60 * 1000;

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

// Validates the Telegram WebApp initData sent by the Mini App on load and
// returns the real, verified Telegram user (name + id) behind it.
router.post("/telegram/auth", (req, res): void => {
  const { token } = getBotConfig();
  if (!token) {
    res.status(503).json({ error: "BOT_TOKEN not set" });
    return;
  }

  const initData = req.body?.initData;
  if (typeof initData !== "string" || initData.length === 0) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const user = verifyInitData(initData, token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired Telegram initData" });
    return;
  }

  res.status(200).json({ user });
});

// Proxies the user's real Telegram profile photo. Telegram file URLs require
// the bot token to resolve, so we fetch server-side and stream the bytes
// back rather than exposing the token to the client.
router.get("/telegram/avatar/:userId", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) {
    res.status(503).end();
    return;
  }

  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) {
    res.status(400).end();
    return;
  }

  try {
    const cached = avatarFilePathCache.get(userId);
    let filePath: string | null;

    if (cached && cached.expiresAt > Date.now()) {
      filePath = cached.filePath;
    } else {
      const photosRes = await fetch(
        `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${userId}&limit=1`,
      );
      const photosData = (await photosRes.json()) as {
        result?: { photos?: Array<Array<{ file_id?: string }>> };
      };
      const fileId = photosData?.result?.photos?.[0]?.[0]?.file_id;

      if (!fileId) {
        filePath = null;
      } else {
        const fileRes = await fetch(
          `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
        );
        const fileData = (await fileRes.json()) as {
          result?: { file_path?: string };
        };
        filePath = fileData?.result?.file_path ?? null;
      }

      avatarFilePathCache.set(userId, { filePath, expiresAt: Date.now() + AVATAR_CACHE_TTL_MS });
    }

    if (!filePath) {
      res.status(404).end();
      return;
    }

    const imageRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!imageRes.ok || !imageRes.body) {
      res.status(404).end();
      return;
    }

    res.setHeader(
      "Content-Type",
      imageRes.headers.get("content-type") ?? "image/jpeg",
    );
    res.setHeader("Cache-Control", "private, max-age=600");
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    res.status(200).send(buffer);
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch Telegram avatar");
    res.status(502).end();
  }
});

// Registers the Telegram webhook + bot commands for the GramMiner bot.
router.get("/telegram/setup", async (_req, res) => {
  const { token, appUrl } = getBotConfig();
  if (!token) {
    res.status(400).json({ error: "BOT_TOKEN not set" });
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
