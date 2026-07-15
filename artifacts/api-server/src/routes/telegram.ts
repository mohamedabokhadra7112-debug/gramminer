import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { verifyInitData } from "../lib/telegramAuth";
import { getDb } from "../lib/db";

const router: IRouter = Router();

function getAdminId(): number {
  return Number(process.env["ADMIN_ID"] ?? 0);
}

function getBotConfig() {
  // Accept either BOT_TOKEN or TELEGRAM_BOT_TOKEN for backwards compatibility
  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  const appUrl = process.env["APP_URL"];
  return { token, appUrl };
}

// Simple in-memory cache for avatar file paths
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

async function editMessageText(
  token: string,
  chat_id: number,
  message_id: number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, message_id, text, parse_mode: "HTML", ...extra }),
  });
}

async function answerCallbackQuery(token: string, callback_query_id: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id, ...(text ? { text } : {}) }),
  });
}

/** The main admin panel inline keyboard. */
function adminMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✏️ تغيير رسالة الترحيب", callback_data: "admin:welcome" },
        { text: "📊 الإحصائيات",           callback_data: "admin:stats"   },
      ],
      [
        { text: "📋 إدارة المهام",          callback_data: "admin:tasks"   },
        { text: "📢 قنوات الاشتراك",        callback_data: "admin:channels"},
      ],
      [
        { text: "💸 سعر الإحالة",           callback_data: "admin:referral"},
        { text: "👤 إدارة المستخدمين",      callback_data: "admin:users"   },
      ],
    ],
  };
}

/** Checks if a user is a member of a channel. Returns false on error. */
async function isMemberOf(token: string, chatId: number, channelUsername: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${token}/getChatMember?chat_id=@${channelUsername}&user_id=${chatId}`,
    );
    const data = (await r.json()) as { result?: { status?: string } };
    const status = data?.result?.status;
    return status === "member" || status === "administrator" || status === "creator";
  } catch {
    return false;
  }
}

/** Returns channels the user is NOT subscribed to. */
async function getMissingChannels(
  token: string,
  userId: number,
): Promise<Array<{ channelUsername: string; channelName: string }>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const { channelsTable } = await import("@workspace/db");
    const channels = await db.select().from(channelsTable);
    const missing: Array<{ channelUsername: string; channelName: string }> = [];
    for (const ch of channels) {
      const ok = await isMemberOf(token, userId, ch.channelUsername);
      if (!ok) missing.push({ channelUsername: ch.channelUsername, channelName: ch.channelName ?? ch.channelUsername });
    }
    return missing;
  } catch {
    return [];
  }
}

/** Gets welcome message from DB, falls back to default. */
async function getWelcomeMessage(firstName: string): Promise<string> {
  const db = await getDb();
  if (db) {
    try {
      const { settingsTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "welcome_message"));
      if (row?.value) return row.value.replace("{first_name}", firstName);
    } catch { /* fall through */ }
  }
  return (
    `⛏️ <b>Welcome to GramMiner, ${firstName}!</b>\n\n` +
    `💰 Start mining GMR by tapping the coin!\n` +
    `🏆 Compete with friends and earn rewards!\n\n` +
    `👇 Press the button below to start:`
  );
}

/** Upserts user in DB after any interaction. */
async function upsertUser(user: { id: number; first_name?: string; username?: string }) {
  const db = await getDb();
  if (!db) return;
  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db
      .insert(usersTable)
      .values({
        telegramId: user.id,
        firstName: user.first_name ?? null,
        username: user.username ?? null,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          firstName: user.first_name ?? null,
          username: user.username ?? null,
          lastActiveAt: new Date(),
        },
      });
  } catch { /* best-effort */ }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Validates Telegram WebApp initData and returns the verified user.
router.post("/telegram/auth", (req, res): void => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.body?.initData;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid or expired Telegram initData" }); return; }

  const adminId = getAdminId();
  res.status(200).json({ user, isAdmin: adminId > 0 && user.id === adminId });
});

// Proxies the user's Telegram profile photo server-side (token stays hidden).
router.get("/telegram/avatar/:userId", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).end(); return; }

  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) { res.status(400).end(); return; }

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
        const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const fileData = (await fileRes.json()) as { result?: { file_path?: string } };
        filePath = fileData?.result?.file_path ?? null;
      }

      avatarFilePathCache.set(userId, { filePath, expiresAt: Date.now() + AVATAR_CACHE_TTL_MS });
    }

    if (!filePath) { res.status(404).end(); return; }

    const imageRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!imageRes.ok || !imageRes.body) { res.status(404).end(); return; }

    res.setHeader("Content-Type", imageRes.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=600");
    res.status(200).send(Buffer.from(await imageRes.arrayBuffer()));
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch Telegram avatar");
    res.status(502).end();
  }
});

// Registers the Telegram webhook and bot commands.
router.get("/telegram/setup", async (_req, res) => {
  const { token, appUrl } = getBotConfig();
  if (!token) { res.status(400).json({ error: "BOT_TOKEN not set" }); return; }
  if (!appUrl) { res.status(400).json({ error: "APP_URL not set" }); return; }

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

// Returns current webhook info for diagnostics.
router.get("/telegram/webhookinfo", async (_req, res) => {
  const { token } = getBotConfig();
  if (!token) { res.status(400).json({ error: "BOT_TOKEN / TELEGRAM_BOT_TOKEN not set" }); return; }
  const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await r.json();
  res.status(200).json(data);
});

// Handles incoming Telegram bot updates.
// Accepts both /api/telegram/webhook (new) and /api/webhook (old Vercel path) to survive migration.
router.post(["/telegram/webhook", "/webhook"], async (req, res) => {
  const { token, appUrl } = getBotConfig();
  if (!token) {
    logger.error("BOT_TOKEN / TELEGRAM_BOT_TOKEN is not set — cannot handle Telegram update");
    res.status(200).json({ ok: true });
    return;
  }

  const update = req.body;
  const adminId = getAdminId();

  // ── callback_query: admin panel button presses ──────────────────────────────
  if (update?.callback_query) {
    const cq = update.callback_query;
    const cqFrom = cq.from ?? {};
    const isAdminCq = adminId > 0 && cqFrom.id === adminId;
    const callbackId: string = cq.id;
    const data: string = cq.data ?? "";
    const chat_id: number = cq.message?.chat?.id;
    const message_id: number = cq.message?.message_id;

    // Always acknowledge immediately so Telegram stops the spinner
    await answerCallbackQuery(token, callbackId);

    // Every action re-validates admin server-side
    if (!isAdminCq || !chat_id || !message_id) {
      res.status(200).json({ ok: true });
      return;
    }

    try {
      if (data === "admin:stats") {
        const db = await getDb();
        let statsText = `📊 <b>الإحصائيات</b>\n\n🤖 Bot: GramMiner\n💎 Token: GMR\n✅ Status: Running`;
        if (db) {
          try {
            const { usersTable } = await import("@workspace/db");
            const { count } = await import("drizzle-orm");
            const [total] = await db.select({ count: count() }).from(usersTable);
            statsText += `\n👤 إجمالي المستخدمين: ${total?.count ?? 0}`;
          } catch { /* ignore */ }
        }
        await editMessageText(token, chat_id, message_id, statsText, {
          reply_markup: { inline_keyboard: [[{ text: "« رجوع", callback_data: "admin:back" }]] },
        });
      } else if (data === "admin:welcome") {
        await editMessageText(
          token, chat_id, message_id,
          `✏️ <b>تغيير رسالة الترحيب</b>\n\nابعت الرسالة الجديدة نصًا في المحادثة.\nاستخدم <code>{first_name}</code> لاسم المستخدم.`,
          { reply_markup: { inline_keyboard: [[{ text: "« رجوع", callback_data: "admin:back" }]] } },
        );
      } else if (data === "admin:tasks") {
        await editMessageText(
          token, chat_id, message_id,
          `📋 <b>إدارة المهام</b>\n\nهذه الميزة قيد التطوير.\nستتيح قريبًا إنشاء وإدارة مهام المستخدمين.`,
          { reply_markup: { inline_keyboard: [[{ text: "« رجوع", callback_data: "admin:back" }]] } },
        );
      } else if (data === "admin:channels") {
        const db = await getDb();
        let chText = `📢 <b>قنوات الاشتراك الإجباري</b>\n\n`;
        if (db) {
          try {
            const { channelsTable } = await import("@workspace/db");
            const channels = await db.select().from(channelsTable);
            if (channels.length === 0) {
              chText += `لا توجد قنوات مضافة حاليًا.`;
            } else {
              chText += channels.map((c) => `• @${c.channelUsername} — ${c.channelName ?? c.channelUsername}`).join("\n");
            }
          } catch { chText += `تعذّر تحميل القنوات.`; }
        } else {
          chText += `قاعدة البيانات غير متاحة.`;
        }
        await editMessageText(token, chat_id, message_id, chText, {
          reply_markup: { inline_keyboard: [[{ text: "« رجوع", callback_data: "admin:back" }]] },
        });
      } else if (data === "admin:referral") {
        await editMessageText(
          token, chat_id, message_id,
          `💸 <b>سعر الإحالة</b>\n\nهذه الميزة قيد التطوير.\nستتيح قريبًا تحديد مكافأة كل إحالة ناجحة.`,
          { reply_markup: { inline_keyboard: [[{ text: "« رجوع", callback_data: "admin:back" }]] } },
        );
      } else if (data === "admin:users") {
        await editMessageText(
          token, chat_id, message_id,
          `👤 <b>إدارة المستخدمين</b>\n\nابعت الـ ID أو Username بتاع المستخدم للبحث عنه وإدارته.`,
          { reply_markup: { inline_keyboard: [[{ text: "« رجوع", callback_data: "admin:back" }]] } },
        );
      } else if (data === "admin:back") {
        await editMessageText(token, chat_id, message_id, `👑 <b>لوحة تحكم GramMiner</b>\n\nاختر من القائمة:`, {
          reply_markup: adminMainKeyboard(),
        });
      }
    } catch (err) {
      logger.error({ err }, "Failed to handle admin callback_query");
    }

    res.status(200).json({ ok: true });
    return;
  }

  // ── Regular message handler ─────────────────────────────────────────────────
  const msg = update?.message;
  if (!msg) { res.status(200).json({ ok: true }); return; }

  const chat_id: number = msg.chat.id;
  const text: string = msg.text || "";
  const from = msg.from ?? {};
  const firstName: string = from.first_name || "Miner";
  const isAdmin = adminId > 0 && from.id === adminId;

  // Track the user in DB (best-effort)
  void upsertUser({ id: from.id, first_name: from.first_name, username: from.username });

  try {
    if (text === "/start" || text.startsWith("/start ")) {
      // 1. Check mandatory channel subscriptions
      const missing = await getMissingChannels(token, from.id);
      if (missing.length > 0) {
        const channelList = missing
          .map((c) => `• <a href="https://t.me/${c.channelUsername}">${c.channelName || "@" + c.channelUsername}</a>`)
          .join("\n");
        await sendMessage(
          token,
          chat_id,
          `⚠️ <b>يجب عليك الانضمام للقنوات التالية أولاً:</b>\n\n${channelList}\n\n` +
            `بعد الانضمام، اضغط /start مجدداً للمتابعة.`,
        );
        res.status(200).json({ ok: true });
        return;
      }

      // 2. Welcome message + open button in one message
      const welcomeText = await getWelcomeMessage(firstName);
      await sendMessage(token, chat_id, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⛏️ Open GramMiner", web_app: { url: appUrl || "https://your-app.vercel.app" } }],
          ],
        },
      });
    } else if (text === "/balance") {
      await sendMessage(
        token, chat_id,
        `💰 <b>Your GramMiner Balance</b>\n\nOpen the app to see your full balance!\n⛏️ Keep mining to earn more GMR!`,
      );
    } else if (text === "/admin") {
      if (isAdmin) {
        await sendMessage(token, chat_id, `👑 <b>لوحة تحكم GramMiner</b>\n\nاختر من القائمة:`, {
          reply_markup: adminMainKeyboard(),
        });
      }
      // Non-admins: silently ignore
    } else if (isAdmin && text.startsWith("/broadcast ")) {
      const broadcastMsg = text.replace("/broadcast ", "");
      await sendMessage(token, chat_id, `📢 <b>Broadcast:</b> ${broadcastMsg}\n\n⚠️ يحتاج قاعدة بيانات لإرسال للكل`);
    }
  } catch (err) {
    logger.error({ err }, "Failed to handle Telegram webhook update");
  }

  res.status(200).json({ ok: true });
});

export default router;
