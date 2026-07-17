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
  // APP_URL  = the API server's own public URL — used to register the webhook
  // MINI_APP_URL = the frontend Mini App URL — used in the /start button (web_app)
  const appUrl    = process.env["APP_URL"];
  const miniAppUrl = process.env["MINI_APP_URL"] ?? appUrl;
  return { token, appUrl, miniAppUrl };
}

// Simple in-memory cache for avatar file paths
const avatarFilePathCache = new Map<number, { filePath: string | null; expiresAt: number }>();

// ─── Earnings log schema (lazy, once per server start) ───────────────────────
let earningsSchemaReady = false;
async function ensureEarningsSchema(): Promise<void> {
  if (earningsSchemaReady) return;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_earnings_log (
        id          serial PRIMARY KEY,
        telegram_id bigint NOT NULL,
        amount      double precision NOT NULL,
        created_at  timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS gm_earnings_log_tg_ts
       ON gm_earnings_log (telegram_id, created_at DESC)`,
    );
    earningsSchemaReady = true;
  } catch { /* non-critical — table may already exist */ }
}
const AVATAR_CACHE_TTL_MS = 10 * 60 * 1000;

async function sendMessage(
  token: string,
  chat_id: number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  logger.debug({ chat_id, hasReplyMarkup: !!extra["reply_markup"] }, "Calling Telegram sendMessage");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "HTML", ...extra }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    logger.error({ status: r.status, data }, "Telegram sendMessage failed");
  } else {
    logger.debug({ status: r.status, data }, "Telegram sendMessage succeeded");
  }
  return data;
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
    `💰 Start mining gram by tapping the coin!\n` +
    `🏆 Compete with friends and earn rewards!\n\n` +
    `👇 Press the button below to start:`
  );
}

/** Upserts user in DB after any interaction.
 *  language_code is saved on first INSERT only — never overwritten on update
 *  so the user's own language preference (set via Mini App) is preserved. */
async function upsertUser(user: {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    // Map Telegram language_code to supported app language
    const initialLang = user.language_code === "ar" ? "ar"
                      : user.language_code           ? "en"
                      : null;
    await db
      .insert(usersTable)
      .values({
        telegramId:  user.id,
        firstName:   user.first_name ?? null,
        lastName:    user.last_name  ?? null,
        username:    user.username   ?? null,
        language:    initialLang,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          firstName:    user.first_name ?? null,
          lastName:     user.last_name  ?? null,
          username:     user.username   ?? null,
          lastActiveAt: new Date(),
          // language intentionally NOT updated here — preserve user's choice
        },
      });
  } catch { /* best-effort */ }
}

/** Fetches the user's persisted gram balance from the DB. Returns 0 if unavailable. */
async function getUserBalance(telegramId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId));
    return row?.balance ?? 0;
  } catch {
    return 0;
  }
}

/** Fetches the user's persisted coin balance from the DB. Returns 0 if unavailable. */
async function getUserCoins(telegramId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    // Ensure coins column exists (lazy migration)
    const { pool } = await import("@workspace/db");
    await pool.query("ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0").catch(() => {});
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ coins: usersTable.coins })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId));
    return row?.coins ?? 0;
  } catch {
    return 0;
  }
}

/** Reads the user's stored language; falls back to Telegram language_code or 'ar'. */
async function getUserLanguage(
  telegramId: number,
  fallbackLangCode?: string,
): Promise<"ar" | "en"> {
  const db = await getDb();
  if (db) {
    try {
      const { usersTable } = await import("@workspace/db");
      const { eq }         = await import("drizzle-orm");
      const [row] = await db
        .select({ language: usersTable.language })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId));
      const lang = row?.language;
      if (lang === "ar" || lang === "en") return lang;
    } catch { /* fall through */ }
  }
  return fallbackLangCode === "ar" ? "ar" : "en";
}

/** Bot UI strings — indexed by language then key. */
const BOT_MSG: Record<"ar" | "en", Record<string, string>> = {
  ar: {
    missing_channels: "⚠️ <b>يجب عليك الانضمام للقنوات التالية أولاً:</b>\n\n{channels}\n\nبعد الانضمام، اضغط /start مجدداً للمتابعة.",
    open_button:      "⛏️ افتح GramMiner",
    balance:          "💰 <b>رصيدك في GramMiner</b>\n\nافتح التطبيق لرؤية رصيدك الكامل!\n⛏️ استمر في التعدين لكسب المزيد من gram!",
    welcome_default:  "<tg-emoji emoji-id=\"5339536521009571338\">👋</tg-emoji> مرحباً بك في GramMiner، {first_name}!\n\n<tg-emoji emoji-id=\"5409048419211682843\">💵</tg-emoji> ابدأ تعدين gram بالضغط على العملة!\n<tg-emoji emoji-id=\"5299015076529872050\">🏆</tg-emoji> نافس أصدقاءك واكسب مكافآت!\n\n<tg-emoji emoji-id=\"5852805286342957224\">👇</tg-emoji> اضغط الزر أدناه للبدء:",
  },
  en: {
    missing_channels: "⚠️ <b>You must join the following channels first:</b>\n\n{channels}\n\nAfter joining, press /start again to continue.",
    open_button:      "⛏️ Open GramMiner",
    balance:          "💰 <b>Your GramMiner Balance</b>\n\nOpen the app to see your full balance!\n⛏️ Keep mining to earn more gram!",
    welcome_default:  "<tg-emoji emoji-id=\"5339536521009571338\">👋</tg-emoji> Welcome to GramMiner, {first_name}!\n\n<tg-emoji emoji-id=\"5409048419211682843\">💵</tg-emoji> Start mining gram by tapping the coin!\n<tg-emoji emoji-id=\"5299015076529872050\">🏆</tg-emoji> Compete with friends and earn rewards!\n\n<tg-emoji emoji-id=\"5852805286342957224\">👇</tg-emoji> Press the button below to start:",
  },
};

/**
 * Counts UTF-16 code units in a string — the unit Telegram uses for entity
 * offsets. Characters in the BMP (≤ U+FFFF) cost 1 unit; supplementary chars
 * (most emoji, > U+FFFF) cost 2 units (surrogate pair).
 */
function utf16Len(s: string): number {
  let n = 0;
  for (const ch of s) { n += (ch.codePointAt(0)! > 0xFFFF) ? 2 : 1; }
  return n;
}

/**
 * Scans the welcome text and returns custom_emoji entities for the four
 * known emoji, computing their exact UTF-16 offsets on the fly.
 * Regular emoji in the text act as a fallback for non-Premium users;
 * the entities override the display for Premium users.
 */
function buildWelcomeEntities(
  text: string,
): { type: string; offset: number; length: number; custom_emoji_id: string }[] {
  const CUSTOM_IDS: Record<string, string> = {
    "👋": "5339536521009571338",
    "💵": "5409048419211682843",
    "🏆": "5299015076529872050",
    "👇": "5852805286342957224",
  };
  const entities: { type: string; offset: number; length: number; custom_emoji_id: string }[] = [];
  let offset = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const id = CUSTOM_IDS[ch];
    if (id) entities.push({ type: "custom_emoji", offset, length: 2, custom_emoji_id: id });
    offset += cp > 0xFFFF ? 2 : 1;
  }
  return entities;
}

/** Returns the localized welcome message: tries language-specific DB key first. */
async function getLocalizedWelcomeMessage(
  firstName: string,
  lang: "ar" | "en",
): Promise<string> {
  const db = await getDb();
  if (db) {
    try {
      const { settingsTable } = await import("@workspace/db");
      const { eq }            = await import("drizzle-orm");
      // Try language-specific key (welcome_message_ar / welcome_message_en) first
      const [langRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, `welcome_message_${lang}`));
      if (langRow?.value) return langRow.value.replace("{first_name}", firstName);
      // Fall back to generic admin-set message
      const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "welcome_message"));
      if (row?.value) return row.value.replace("{first_name}", firstName);
    } catch { /* fall through */ }
  }
  return BOT_MSG[lang].welcome_default.replace("{first_name}", firstName);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Validates Telegram WebApp initData, syncs the user to the DB (register on
// first sight / refresh basic info on return), and returns the verified user
// together with their persisted gram balance so the Frontend never shows a
// stale or default "Miner" placeholder once a user has interacted before.
router.post("/telegram/auth", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.body?.initData;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid or expired Telegram initData" }); return; }

  await upsertUser({
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
  });
  const [balance, coins] = await Promise.all([getUserBalance(user.id), getUserCoins(user.id)]);

  const adminId = getAdminId();
  res.status(200).json({ user: { ...user, balance, coins }, isAdmin: adminId > 0 && user.id === adminId });
});

// Securely persists a mining-session claim. The claimed amount is added to
// the user's DB-backed balance; the Telegram identity is re-verified from
// initData server-side, so a client can never claim on behalf of another
// user or spoof its own telegram_id.
router.post("/telegram/claim", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.body?.initData;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid or expired Telegram initData" }); return; }

  // Parse and round to 6 decimal places to prevent floating-point accumulation.
  const amount = Math.round(Number(req.body?.amount) * 1_000_000) / 1_000_000;
  // Reject non-finite, non-positive, or implausibly large amounts — a basic
  // guard against obvious client tampering until real anti-cheat exists.
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    res.status(400).json({ error: "Invalid claim amount" });
    return;
  }

  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    // Ensure the row exists (first-time claimers who never hit /auth yet).
    await upsertUser({ id: user.id, first_name: user.first_name, last_name: user.last_name, username: user.username });
    // Use NUMERIC arithmetic then cast back to double precision so every claim
    // is stored with at most 6 decimal places — preventing floating-point drift
    // from accumulating across thousands of small additions.
    const [row] = await db
      .update(usersTable)
      .set({
        balance: sql`ROUND(CAST(${usersTable.balance} AS numeric) + CAST(${amount} AS numeric), 6)::double precision`,
        lastActiveAt: new Date(),
      })
      .where(eq(usersTable.telegramId, user.id))
      .returning({ balance: usersTable.balance });

    // Log this claim for rolling 24-hour earnings tracking (fire-and-forget).
    ensureEarningsSchema().then(async () => {
      try {
        const { pool } = await import("@workspace/db");
        await pool.query(
          "INSERT INTO gm_earnings_log (telegram_id, amount) VALUES ($1, $2)",
          [user.id, amount],
        );
      } catch { /* non-critical */ }
    });

    res.status(200).json({ balance: row?.balance ?? amount });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to persist claim");
    res.status(500).json({ error: "Failed to persist claim" });
  }
});

// Returns the sum of all mining claims in the rolling last 24 hours for this user.
router.get("/telegram/earnings/24h", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ earnings: 0 }); return; }

  const initData = req.headers["x-init-data"];
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "x-init-data header required" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  try {
    await ensureEarningsSchema();
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ earnings: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS earnings
       FROM gm_earnings_log
       WHERE telegram_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [user.id],
    );
    const earnings = parseFloat(result.rows[0]?.earnings ?? "0");
    res.status(200).json({ earnings });
  } catch (err) {
    logger.error({ err, userId: user.id }, "GET /telegram/earnings/24h failed");
    res.status(500).json({ earnings: 0 });
  }
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

// Returns referral stats for the current user.
router.get("/telegram/referrals", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.status(400).json({ error: "x-init-data required" }); return; }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  try {
    const { pool } = await import("@workspace/db");
    // Ensure tables exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_referrals (
        id serial PRIMARY KEY, referrer_id bigint NOT NULL,
        referred_id bigint NOT NULL UNIQUE, reward_paid boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT NOW()
      )
    `).catch(() => {});
    const result = await pool.query(
      "SELECT COUNT(*) AS count FROM gm_referrals WHERE referrer_id=$1",
      [user.id],
    );
    const count = Number(result.rows[0]?.count ?? 0);
    // Read referral_price from settings, fall back to 1
    let referralPrice = 1;
    try {
      const db2 = await getDb();
      if (db2) {
        const { settingsTable } = await import("@workspace/db");
        const { eq: eqS } = await import("drizzle-orm");
        const [priceRow] = await db2.select().from(settingsTable).where(eqS(settingsTable.key, "referral_price"));
        if (priceRow?.value) referralPrice = Number(priceRow.value) || 1;
      }
    } catch { /* use default */ }
    res.json({ count, reward: +(count * referralPrice).toFixed(4) });
  } catch {
    res.json({ count: 0, reward: 0 });
  }
});

// Save / update wallet address for the current user — with uniqueness check.
router.post("/telegram/wallet", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = (req.body?.initData ?? "") as string;
  const address  = (req.body?.address ?? "")  as string;

  if (!initData) { res.status(400).json({ error: "initData required" }); return; }
  if (!address)  { res.status(400).json({ error: "address required" });  return; }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { eq, and, ne } = await import("drizzle-orm");

    // Check uniqueness: is this address already linked to a DIFFERENT user?
    const [taken] = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(and(eq(usersTable.walletAddress, address), ne(usersTable.telegramId, user.id)));

    if (taken) {
      res.status(409).json({ error: "wallet_taken", message: "هذا العنوان مرتبط بحساب آخر بالفعل" });
      return;
    }

    // Save
    await db
      .update(usersTable)
      .set({ walletAddress: address })
      .where(eq(usersTable.telegramId, user.id));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /telegram/wallet failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// Remove wallet address for the current user.
router.delete("/telegram/wallet", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = (req.body?.initData ?? "") as string;
  if (!initData) { res.status(400).json({ error: "initData required" }); return; }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  const db = await getDb();
  if (!db) { res.status(503).json({ error: "DB not available" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db.update(usersTable).set({ walletAddress: null }).where(eq(usersTable.telegramId, user.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /telegram/wallet failed");
    res.status(500).json({ error: "Internal error" });
  }
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
  logger.debug({ path: req.path, hasBody: !!req.body }, "Telegram webhook received");

  const { token, appUrl, miniAppUrl } = getBotConfig();
  logger.debug(
    {
      tokenPresent: !!token,
      tokenSource: process.env["BOT_TOKEN"] ? "BOT_TOKEN" : process.env["TELEGRAM_BOT_TOKEN"] ? "TELEGRAM_BOT_TOKEN" : "none",
      appUrlPresent: !!appUrl,
    },
    "Bot config loaded",
  );
  if (!token) {
    logger.error(
      "BOT_TOKEN / TELEGRAM_BOT_TOKEN is not set — stopping before any Telegram API call. Set the secret to enable the bot.",
    );
    res.status(200).json({ ok: true });
    return;
  }

  const update = req.body;
  logger.debug({ updateId: update?.update_id, messageText: update?.message?.text }, "Update received");
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
        let statsText = `📊 <b>الإحصائيات</b>\n\n🤖 Bot: GramMiner\n💎 Token: gram\n✅ Status: Running`;
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

  // ── Detect new vs. returning user BEFORE upsert ──────────────────────────
  // upsertUser uses ON CONFLICT DO UPDATE so it always succeeds — we cannot
  // tell new from returning after the fact.  Check first, then upsert.
  let isNewUser = false;
  try {
    const db = await getDb();
    if (db) {
      const { usersTable } = await import("@workspace/db");
      const { eq }         = await import("drizzle-orm");
      const rows = await db
        .select({ id: usersTable.telegramId })
        .from(usersTable)
        .where(eq(usersTable.telegramId, from.id))
        .limit(1);
      isNewUser = rows.length === 0;
    }
  } catch { /* best-effort */ }

  // Upsert awaited (not void) so the user row exists before any referral credit
  await upsertUser({ id: from.id, first_name: from.first_name, username: from.username, language_code: from.language_code });

  try {
    if (text === "/start" || text.startsWith("/start ")) {
      logger.debug({ chat_id, firstName, isNewUser }, "/start handler entered");

      // ── Process referral code embedded in /start payload ──────────────────
      // Supported formats:
      //   /start 123456789       — plain Telegram user ID  (preferred)
      //   /start 123456789       — standard referral format
      //
      // Guards (all must pass before crediting):
      //   1. isNewUser  — only first-time users count as a valid referral
      //   2. referrerId !== from.id — no self-referral
      //   3. referrer exists in gm_users — must be a real registered user
      //   4. referred_id not already in gm_referrals — idempotency guard
      const startPayload = text.slice("/start".length).trim();
      const referralMatch = startPayload.match(/^(?:GMR)?(\d{5,})$/);
      if (referralMatch && isNewUser) {
        const referrerId = Number(referralMatch[1]);
        if (referrerId && referrerId !== from.id) {
          const db = await getDb();
          if (db) {
            try {
              const { pool }       = await import("@workspace/db");
              const { usersTable } = await import("@workspace/db");
              const { eq, sql }    = await import("drizzle-orm");

              // Ensure schema exists
              await pool.query("ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS referred_by bigint").catch(() => {});
              await pool.query(`
                CREATE TABLE IF NOT EXISTS gm_referrals (
                  id          serial PRIMARY KEY,
                  referrer_id bigint  NOT NULL,
                  referred_id bigint  NOT NULL UNIQUE,
                  reward_paid boolean NOT NULL DEFAULT false,
                  created_at  timestamp NOT NULL DEFAULT NOW()
                )
              `).catch(() => {});

              // Guard 3: verify the referrer is a real registered user
              const referrerRows = await db
                .select({ id: usersTable.telegramId })
                .from(usersTable)
                .where(eq(usersTable.telegramId, referrerId))
                .limit(1);
              if (referrerRows.length === 0) {
                logger.warn({ referrerId, from: from.id }, "Referral skipped: referrer not found in DB");
              } else {
                // Guard 4: idempotency — never credit the same referred user twice
                const existing = await pool.query(
                  "SELECT id FROM gm_referrals WHERE referred_id=$1",
                  [from.id],
                );
                if (existing.rows.length === 0) {
                  // Insert referral record
                  await pool.query(
                    "INSERT INTO gm_referrals (referrer_id, referred_id, reward_paid) VALUES ($1, $2, true) ON CONFLICT DO NOTHING",
                    [referrerId, from.id],
                  );
                  // Store referred_by on the new user's row
                  await db
                    .update(usersTable)
                    .set({ referredBy: referrerId })
                    .where(eq(usersTable.telegramId, from.id));
                  // Credit the referrer's coins — read reward from settings, fall back to 1
                  let referralReward = 1;
                  try {
                    const { settingsTable } = await import("@workspace/db");
                    const { eq: eqS } = await import("drizzle-orm");
                    const [priceRow] = await db.select().from(settingsTable).where(eqS(settingsTable.key, "referral_price"));
                    if (priceRow?.value) referralReward = Number(priceRow.value) || 1;
                  } catch { /* use default */ }
                  // Ensure coins column exists before crediting
                  await pool.query("ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0").catch(() => {});
                  await db
                    .update(usersTable)
                    .set({ coins: sql`${usersTable.coins} + ${referralReward}` })
                    .where(eq(usersTable.telegramId, referrerId));
                  logger.info({ from: from.id, referrerId, reward: referralReward }, "Referral processed — coins credited");
                  // Notify the referrer — wrapped in try/catch so a blocked bot
                  // or any Telegram error never crashes the overall /start flow
                  try {
                    await sendMessage(
                      token,
                      referrerId,
                      `🎉 <b>تمت إحالة صديقك بنجاح!</b>\n\nانضم مستخدم جديد عبر رابط الإحالة الخاص بك.\n🪙 تم إضافة <b>${referralReward} coin</b> إلى رصيدك.`,
                    );
                  } catch (notifyErr) {
                    logger.warn({ notifyErr, referrerId }, "Referral notification failed (non-fatal)");
                  }
                }
              }
            } catch (e) {
              logger.warn({ e }, "Referral processing failed (non-fatal)");
            }
          }
        }
      }

      // Resolve user's language (DB → Telegram lang_code → default)
      const lang = await getUserLanguage(from.id, from.language_code);
      const msgs = BOT_MSG[lang];

      // 1. Check mandatory channel subscriptions
      const missing = await getMissingChannels(token, from.id);
      if (missing.length > 0) {
        const channelList = missing
          .map((c) => `• <a href="https://t.me/${c.channelUsername}">${c.channelName || "@" + c.channelUsername}</a>`)
          .join("\n");
        await sendMessage(
          token,
          chat_id,
          msgs.missing_channels.replace("{channels}", channelList),
        );
        res.status(200).json({ ok: true });
        return;
      }

      // 2. Localized welcome message + open button
      // Note: sendMessage always sends parse_mode:"HTML" (see the helper above),
      // so we must NOT include an "entities" field — Telegram rejects messages
      // that contain both parse_mode and entities simultaneously.
      const welcomeText = await getLocalizedWelcomeMessage(firstName, "en");
      await sendMessage(token, chat_id, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: BOT_MSG.en.open_button, web_app: { url: miniAppUrl || "https://gramminer-api-server-nine.vercel.app/" } }],
          ],
        },
      });
    } else if (text === "/balance") {
      const lang = await getUserLanguage(from.id, from.language_code);
      await sendMessage(token, chat_id, BOT_MSG[lang].balance);
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

// Deducts coins from the user's coin balance (for miner purchases/upgrades).
// Uses optimistic UI on the client; this endpoint is the authoritative source of truth.
router.post("/telegram/coins/spend", async (req, res): Promise<void> => {
  const { token } = getBotConfig();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.body?.initData;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData is required" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid or expired Telegram initData" }); return; }

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    res.status(400).json({ error: "Invalid amount — must be a positive integer" }); return;
  }

  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Database not available" }); return; }

  try {
    const { pool, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    // Ensure coins column exists (idempotent)
    await pool.query("ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0").catch(() => {});

    // Check current balance
    const [row] = await db
      .select({ coins: usersTable.coins })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));
    const current = row?.coins ?? 0;

    if (current < amount) {
      res.status(400).json({ error: "Insufficient coin balance", coins: current }); return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} - ${amount}` })
      .where(eq(usersTable.telegramId, user.id))
      .returning({ coins: usersTable.coins });

    res.status(200).json({ ok: true, coins: updated?.coins ?? current - amount });
  } catch (err) {
    logger.error({ err, userId: user.id }, "POST /telegram/coins/spend failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
