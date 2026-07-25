// api/index.js — Single Vercel Serverless Function
// Consolidates all /api/* routes (was 17 separate files).
// vercel.json rewrites /api/:path* → /api/index so this one
// function handles every request.

'use strict';

const { createHmac } = require('node:crypto');
const { Pool }       = require('pg');

// ── Shared helpers from existing _auth / _db modules ──────────────────────
const { verifyTelegramUser, verifyAdmin } = require('./admin/_auth');
const { getPool }                         = require('./admin/_db');

// ── Env ────────────────────────────────────────────────────────────────────
const TOKEN        = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const ADMIN_ID     = Number(process.env.ADMIN_ID || 0);
const ADMIN_IDS    = [6145230334, 868999453];
const APP_URL      = process.env.APP_URL || 'https://gramminer-api-server-nine.vercel.app';
const WEBHOOK_URL  = process.env.WEBHOOK_URL || `${APP_URL}/api/webhook`;
const MIN_WITHDRAW = 0.1;
const MAX_CLAIM    = 100_000;

const DEFAULT_TASKS = [
  { title: 'انضم لقناتنا على تيليجرام',  description: 'تابع قناتنا الرسمية للحصول على آخر الأخبار',  reward: 50  },
  { title: 'تابعنا على تويتر / X',        description: 'تابع حسابنا الرسمي على منصة X',               reward: 50  },
  { title: 'ادعُ 3 أصدقاء',               description: 'شارك الرابط الخاص بك واحصل على مكافأتك',     reward: 200 },
  { title: 'سجّل الدخول يومياً',          description: 'افتح التطبيق كل يوم للحصول على مكافأة يومية', reward: 10  },
  { title: 'ابدأ تعدين GMR',              description: 'اشترِ أول ماينر لك وابدأ رحلة التعدين',       reward: 500 },
];

const DEFAULT_MINERS = [
  { id: 1,  name: 'Stone Collector',     baseCost: 10,    dailyPct: 0.05, description: '' },
  { id: 2,  name: 'Copper Miner',        baseCost: 50,    dailyPct: 0.05, description: '' },
  { id: 3,  name: 'Ore Cart',            baseCost: 250,   dailyPct: 0.05, description: '' },
  { id: 4,  name: 'Crystal Hunter',      baseCost: 500,   dailyPct: 0.05, description: '' },
  { id: 5,  name: 'Forge Master',        baseCost: 1000,  dailyPct: 0.05, description: '' },
  { id: 6,  name: 'Mining Drone',        baseCost: 2000,  dailyPct: 0.08, description: '' },
  { id: 7,  name: 'Quantum Excavator',   baseCost: 5000,  dailyPct: 0.08, description: '' },
  { id: 8,  name: 'Satellite Extractor', baseCost: 10000, dailyPct: 0.08, description: '' },
  { id: 9,  name: 'Planet Miner',        baseCost: 15000, dailyPct: 0.08, description: '' },
  { id: 10, name: 'Gram Core Reactor',   baseCost: 20000, dailyPct: 0.08, description: '' },
];

// ── In-memory cache for avatar proxy ──────────────────────────────────────
const avatarCache  = new Map();
const AVATAR_TTL   = 10 * 60 * 1000; // 10 min

// ── Helpers ────────────────────────────────────────────────────────────────
async function sendTg(chatId, text, extra = {}) {
  if (!TOKEN) return null;
  return fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  }).then(r => r.json()).catch(() => null);
}

async function getSetting(db, key) {
  try {
    if (!db) return null;
    const { rows } = await db.query('SELECT value FROM gm_settings WHERE key = $1 LIMIT 1', [key]);
    return rows[0]?.value ?? null;
  } catch { return null; }
}

// ── Main handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-initdata, x-init-data');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Normalize path (strip trailing slash and query string)
  const path  = (req.url || '/').split('?')[0].replace(/\/$/, '') || '/api';
  const query = req.query || {};
  const body  = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })()
    : (req.body || {});
  const method = req.method;

  try {

    // ════════════════════════════════════════════════════════════════════════
    // GET /api/setup[?migrate=1]
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/setup' && method === 'GET') {
      if (!TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN / BOT_TOKEN not set' });
      const results = {};

      // 1. Register webhook
      try {
        const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: WEBHOOK_URL, allowed_updates: ['message', 'callback_query'] }),
        });
        results.webhook = await r.json();
      } catch (e) { results.webhook = { error: e.message }; }

      // 2. Set commands
      try {
        await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commands: [
            { command: 'start',   description: '🚀 Open GramMiner' },
            { command: 'balance', description: '💰 Check your balance' },
          ]}),
        });
        results.commands = 'ok';
      } catch (e) { results.commands = { error: e.message }; }

      // 3. Migrate + seed (only when ?migrate=1)
      if (query.migrate === '1') {
        if (!process.env.DATABASE_URL) {
          results.migrate = { error: 'DATABASE_URL not set' };
        } else {
          const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
          try {
            await pool.query(`
              CREATE TABLE IF NOT EXISTS gm_users (
                id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL,
                username TEXT, first_name TEXT, last_name TEXT,
                balance NUMERIC(20,6) NOT NULL DEFAULT 0,
                is_banned BOOLEAN NOT NULL DEFAULT FALSE,
                restrict_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
                blocked_bot BOOLEAN NOT NULL DEFAULT FALSE,
                referral_by BIGINT,
                last_active_at TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW()
              );
              CREATE TABLE IF NOT EXISTS gm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
              CREATE TABLE IF NOT EXISTS gm_tasks (
                id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                reward NUMERIC(20,6) NOT NULL DEFAULT 0, is_daily BOOLEAN NOT NULL DEFAULT FALSE,
                is_hidden BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
              );
              CREATE TABLE IF NOT EXISTS gm_channels (
                id SERIAL PRIMARY KEY, channel_username TEXT NOT NULL,
                channel_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
              );
            `);
            const { rows } = await pool.query('SELECT COUNT(*) FROM gm_tasks');
            if (Number(rows[0].count) === 0) {
              for (const t of DEFAULT_TASKS) {
                await pool.query(
                  `INSERT INTO gm_tasks (title, description, reward) VALUES ($1,$2,$3)`,
                  [t.title, t.description, t.reward]
                );
              }
              results.migrate = { tables: 'created', tasks: `${DEFAULT_TASKS.length} default tasks seeded` };
            } else {
              results.migrate = { tables: 'already exist', tasks: 'skipped (table not empty)' };
            }
            await pool.end();
          } catch (e) {
            await pool.end().catch(() => {});
            results.migrate = { error: e.message };
          }
        }
      }

      return res.status(200).json({ ok: true, webhookUrl: WEBHOOK_URL, ...results });
    }

    // ════════════════════════════════════════════════════════════════════════
    // POST /api/webhook — Telegram bot updates
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/webhook' && method === 'POST') {
      if (!TOKEN) return res.status(200).json({ ok: true });

      const update = body;
      if (!update) return res.status(200).json({ ok: true });

      const db = getPool();

      const msg = update.message;
      if (msg) {
        const chat_id = msg.chat.id;
        const text    = msg.text || '';
        const name    = msg.from?.first_name || 'Miner';
        const isAdmin = ADMIN_ID && msg.from?.id === ADMIN_ID;

        if (text === '/start' || text.startsWith('/start ')) {
          const [maintenanceMode, maintenanceMsg, welcomeMsg] = await Promise.all([
            getSetting(db, 'maintenance_mode'),
            getSetting(db, 'maintenance_message'),
            getSetting(db, 'welcome_message'),
          ]);

          if (maintenanceMode === 'true' && !isAdmin) {
            await sendTg(chat_id, maintenanceMsg || '🔧 البوت تحت الصيانة حالياً، سيعود قريباً!');
          } else {
            const welcome = welcomeMsg
              ? welcomeMsg.replace('{first_name}', name)
              : `⛏️ <b>Welcome to GramMiner, ${name}!</b>\n\n` +
                `💰 Start mining gram by tapping the coin!\n` +
                `🏆 Compete with friends and earn rewards!\n\n` +
                `👇 Press the button below to start:`;
            await sendTg(chat_id, welcome, {
              reply_markup: { inline_keyboard: [[{ text: '⛏️ Open GramMiner', web_app: { url: APP_URL } }]] },
            });
          }

        } else if (text === '/balance') {
          await sendTg(chat_id,
            `💰 <b>Your GramMiner Balance</b>\n\nOpen the app to see your full balance!\n⛏️ Keep mining to earn more gram!`
          );

        } else if (isAdmin && text === '/admin') {
          await sendTg(chat_id,
            `👑 <b>Admin Panel — GramMiner</b>\n\nالأوامر المتاحة:\n` +
            `📢 /broadcast [رسالة] — ارسل رسالة لكل المستخدمين\n` +
            `📊 /stats — إحصائيات البوت\n⚙️ /setup — إعادة ضبط الويب هوك`
          );

        } else if (isAdmin && text === '/stats') {
          await sendTg(chat_id,
            `📊 <b>GramMiner Stats</b>\n\n🤖 Bot: GramMiner\n💎 Token: gram\n✅ Status: Running\n👑 Admin: ${ADMIN_ID}`
          );

        } else if (isAdmin && text.startsWith('/broadcast ')) {
          const broadcastMsg = text.replace('/broadcast ', '');
          await sendTg(chat_id, `📢 <b>Broadcast:</b> ${broadcastMsg}\n\n⚠️ يحتاج قاعدة بيانات لإرسال للكل`);

        } else if (!isAdmin && (text === '/admin' || text.startsWith('/broadcast'))) {
          await sendTg(chat_id, `❌ مش مسموحلك بالأمر ده!`);
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ════════════════════════════════════════════════════════════════════════
    // /api/tasks
    // GET                        → list non-hidden tasks
    // GET  ?action=completed     → completed tasks for user
    // POST ?action=complete      → complete a task
    // GET  ?type=combo           → today's combo status
    // POST ?type=combo&action=submit → submit combo
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/tasks') {
      const { action, type } = query;

      // GET ?action=completed
      if (action === 'completed' && method === 'GET') {
        const initData = req.headers['x-init-data'];
        if (!initData || !TOKEN) return res.json([]);
        const user = verifyTelegramUser(initData);
        if (!user) return res.json([]);
        const db = getPool();
        if (!db) return res.json([]);
        try {
          const { rows } = await db.query(
            `SELECT tc.task_id, tc.completed_at, t.is_daily
             FROM gm_task_completions tc
             JOIN gm_tasks t ON t.id = tc.task_id
             WHERE tc.telegram_id = $1`,
            [user.id]
          );
          return res.json(rows.map(r => ({ taskId: r.task_id, completedAt: r.completed_at, isDaily: r.is_daily })));
        } catch { return res.json([]); }
      }

      // POST ?action=complete
      if (action === 'complete' && method === 'POST') {
        const { initData, taskId } = body;
        if (!initData) return res.status(400).json({ error: 'initData required' });
        if (!taskId)   return res.status(400).json({ error: 'taskId required' });
        if (!TOKEN)    return res.status(503).json({ error: 'BOT_TOKEN not configured' });
        const user = verifyTelegramUser(initData);
        if (!user) return res.status(401).json({ error: 'Invalid initData' });
        const db = getPool();
        if (!db) return res.status(503).json({ error: 'DATABASE_URL not configured' });

        await db.query(`ALTER TABLE gm_tasks ADD COLUMN IF NOT EXISTS channel_username text`).catch(() => {});
        await db.query(`
          CREATE TABLE IF NOT EXISTS gm_task_completions (
            id serial PRIMARY KEY, telegram_id bigint NOT NULL, task_id integer NOT NULL,
            completed_at timestamp NOT NULL DEFAULT NOW(), UNIQUE(telegram_id, task_id)
          )
        `).catch(() => {});
        await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0`).catch(() => {});

        const { rows: taskRows } = await db.query(
          `SELECT id, title, reward, is_hidden, is_daily, channel_username FROM gm_tasks WHERE id = $1`,
          [Number(taskId)]
        );
        if (!taskRows.length || taskRows[0].is_hidden) return res.status(404).json({ error: 'Task not found' });
        const task = taskRows[0];

        const { rows: existing } = await db.query(
          `SELECT id, completed_at FROM gm_task_completions WHERE telegram_id = $1 AND task_id = $2`,
          [user.id, task.id]
        );
        if (existing.length > 0) {
          if (!task.is_daily) return res.status(409).json({ error: 'already_completed' });
          const hoursSince = (Date.now() - new Date(existing[0].completed_at).getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            return res.status(409).json({
              error: 'already_completed',
              completedAt: existing[0].completed_at,
              nextAvailableAt: new Date(new Date(existing[0].completed_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }

        if (task.channel_username) {
          try {
            const r = await fetch(
              `https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=@${task.channel_username}&user_id=${user.id}`
            );
            const data = await r.json();
            const st = data?.result?.status;
            if (!['member', 'administrator', 'creator'].includes(st)) {
              return res.status(403).json({ error: 'not_member', channelUsername: task.channel_username });
            }
          } catch { /* Telegram API unreachable — allow through */ }
        }

        let completedAt;
        if (task.is_daily) {
          const { rows: up } = await db.query(
            `INSERT INTO gm_task_completions (telegram_id, task_id) VALUES ($1,$2)
             ON CONFLICT (telegram_id, task_id) DO UPDATE SET completed_at = NOW()
             RETURNING completed_at`,
            [user.id, task.id]
          );
          completedAt = up[0]?.completed_at;
        } else {
          const { rows: ins } = await db.query(
            `INSERT INTO gm_task_completions (telegram_id, task_id) VALUES ($1,$2)
             ON CONFLICT DO NOTHING RETURNING completed_at`,
            [user.id, task.id]
          );
          completedAt = ins[0]?.completed_at;
        }

        const reward = Math.round(Number(task.reward) || 0);
        const { rows: updated } = await db.query(
          `UPDATE gm_users SET coins = coins + $1, last_active_at = NOW()
           WHERE telegram_id = $2 RETURNING coins`,
          [reward, user.id]
        );
        return res.json({ ok: true, reward, coins: updated[0]?.coins ?? 0, completedAt, isDaily: task.is_daily });
      }

      // Combo routes
      if (type === 'combo') {
        const COMBO_ITEMS = [
          { id: 1, name: 'Crystal Core' }, { id: 2, name: 'Mining Pickaxe' },
          { id: 3, name: 'Mining Rig' },   { id: 4, name: 'Server Node' },
          { id: 5, name: 'Treasure Vault' },
        ];
        const initData = req.headers['x-telegram-initdata'] || req.headers['x-init-data'];
        if (!initData || !TOKEN) return res.status(401).json({ error: 'Unauthorized' });
        const user = verifyTelegramUser(initData);
        if (!user) return res.status(401).json({ error: 'Invalid initData' });
        const db = getPool();
        if (!db) return res.status(503).json({ error: 'DATABASE_URL not configured' });

        await db.query(`
          CREATE TABLE IF NOT EXISTS gm_combo_attempts (
            id serial PRIMARY KEY, telegram_id bigint NOT NULL, combo_date text NOT NULL,
            success boolean NOT NULL, reward integer NOT NULL DEFAULT 0,
            created_at timestamp NOT NULL DEFAULT NOW(), UNIQUE(telegram_id, combo_date)
          )
        `).catch(() => {});

        const today = new Date().toISOString().slice(0, 10);

        async function getDailyCombo() {
          const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key = 'daily_combo'`);
          if (rows.length > 0) {
            try {
              const parsed = JSON.parse(rows[0].value);
              if (parsed.date === today) return parsed;
            } catch (_) {}
          }
          const pool2 = [1, 2, 3, 4, 5];
          for (let i = pool2.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool2[i], pool2[j]] = [pool2[j], pool2[i]];
          }
          const correctIds = pool2.slice(0, 3).sort((a, b) => a - b);
          const combo = { date: today, correctIds };
          await db.query(
            `INSERT INTO gm_settings (key, value) VALUES ('daily_combo', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [JSON.stringify(combo)]
          );
          return combo;
        }

        if (method === 'GET') {
          const combo = await getDailyCombo();
          const { rows } = await db.query(
            `SELECT success, reward FROM gm_combo_attempts WHERE telegram_id = $1 AND combo_date = $2`,
            [user.id, today]
          );
          const attempt = rows[0] || null;
          return res.json({
            items: COMBO_ITEMS, attemptedToday: !!attempt,
            success: attempt ? attempt.success : null, reward: attempt ? attempt.reward : null,
          });
        }

        if (method === 'POST' && action === 'submit') {
          const { selectedIds } = body;
          if (!Array.isArray(selectedIds) || selectedIds.length !== 3) {
            return res.status(400).json({ error: 'selectedIds must be an array of exactly 3 IDs' });
          }
          const { rows: existing2 } = await db.query(
            `SELECT id FROM gm_combo_attempts WHERE telegram_id = $1 AND combo_date = $2`,
            [user.id, today]
          );
          if (existing2.length > 0) return res.status(409).json({ error: 'already_attempted' });

          const combo    = await getDailyCombo();
          const selected = [...selectedIds].map(Number).sort((a, b) => a - b);
          const correct  = [...combo.correctIds].sort((a, b) => a - b);
          const success  = selected.length === correct.length && selected.every((v, i) => v === correct[i]);
          const reward   = success ? Math.floor(Math.random() * 10) + 1 : 0;
          try {
            await db.query(
              `INSERT INTO gm_combo_attempts (telegram_id, combo_date, success, reward) VALUES ($1,$2,$3,$4)`,
              [user.id, today, success, reward]
            );
            if (success && reward > 0) {
              await db.query(
                `UPDATE gm_users SET coins = coins + $1, last_active_at = NOW() WHERE telegram_id = $2`,
                [reward, user.id]
              );
            }
            return res.json({ ok: true, success, reward });
          } catch (e) {
            if (e.code === '23505') return res.status(409).json({ error: 'already_attempted' });
            return res.status(500).json({ error: e.message });
          }
        }

        return res.status(405).end();
      }

      // GET /api/tasks — list non-hidden tasks
      if (method !== 'GET') return res.status(405).end();
      const db = getPool();
      if (!db) return res.status(500).json({ error: 'DATABASE_URL not configured' });
      try {
        const { rows } = await db.query(
          `SELECT id, title, description, reward, is_daily FROM gm_tasks WHERE is_hidden = false ORDER BY created_at ASC`
        );
        return res.json(rows.map(r => ({ id: r.id, title: r.title, description: r.description, reward: Number(r.reward), isDaily: r.is_daily })));
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // ════════════════════════════════════════════════════════════════════════
    // POST /api/telegram/auth
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/auth' && method === 'POST') {
      if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });
      const { initData } = body;
      if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData is required' });

      const user = verifyTelegramUser(initData);
      if (!user) return res.status(401).json({ error: 'Invalid or expired Telegram initData' });

      let balance = 0, coins = 0;
      let isAdmin = ADMIN_ID > 0 && user.id === ADMIN_ID;
      try {
        const db = getPool();
        if (db) {
          await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0`).catch(() => {});
          const { rows } = await db.query(
            `INSERT INTO gm_users (telegram_id, first_name, last_name, username, last_active_at)
             VALUES ($1,$2,$3,$4,NOW())
             ON CONFLICT (telegram_id) DO UPDATE
               SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
                   username=EXCLUDED.username, last_active_at=NOW()
             RETURNING balance, coins`,
            [user.id, user.first_name ?? null, user.last_name ?? null, user.username ?? null]
          );
          balance = rows[0]?.balance ?? 0;
          coins   = rows[0]?.coins   ?? 0;
          if (!isAdmin) {
            const { rows: sr } = await db.query(`SELECT value FROM gm_settings WHERE key = 'sub_admins'`);
            const subs = sr[0] ? JSON.parse(sr[0].value) : [];
            if (subs.some(a => a.telegramId === user.id)) isAdmin = true;
          }
        }
      } catch (e) { console.error('DB upsert failed:', e?.message); }

      let notJoinedChannels = [];
      if (!isAdmin) {
        try {
          const db = getPool();
          if (db) {
            const { rows: channels } = await db.query(
              `SELECT channel_username, channel_name FROM gm_channels ORDER BY created_at`
            );
            if (channels.length > 0) {
              const checks = await Promise.all(channels.map(async ch => {
                try {
                  const r = await fetch(
                    `https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=@${ch.channel_username}&user_id=${user.id}`
                  );
                  const data = await r.json();
                  const st = data?.result?.status;
                  if (st === 'left' || st === 'kicked') return { channelUsername: ch.channel_username, channelName: ch.channel_name };
                } catch {}
                return null;
              }));
              notJoinedChannels = checks.filter(Boolean);
            }
          }
        } catch (e) { console.error('Channel check failed:', e?.message); }
      }

      return res.status(200).json({
        user: { id: user.id, first_name: user.first_name ?? null, last_name: user.last_name ?? null, username: user.username ?? null, balance, coins },
        isAdmin,
        notJoinedChannels,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET /api/telegram/avatar/:userId
    // ════════════════════════════════════════════════════════════════════════
    const avatarMatch = path.match(/^\/api\/telegram\/avatar\/(\d+)$/);
    if (avatarMatch) {
      if (!TOKEN) return res.status(503).end();
      const userId = Number(avatarMatch[1]);
      if (!Number.isFinite(userId)) return res.status(400).end();

      try {
        const cached = avatarCache.get(userId);
        let filePath;
        if (cached && cached.expiresAt > Date.now()) {
          filePath = cached.filePath;
        } else {
          const photosRes  = await fetch(`https://api.telegram.org/bot${TOKEN}/getUserProfilePhotos?user_id=${userId}&limit=1`);
          const photosData = await photosRes.json();
          const fileId     = photosData?.result?.photos?.[0]?.[0]?.file_id;
          if (!fileId) {
            filePath = null;
          } else {
            const fileRes  = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();
            filePath       = fileData?.result?.file_path ?? null;
          }
          avatarCache.set(userId, { filePath, expiresAt: Date.now() + AVATAR_TTL });
        }

        if (!filePath) return res.status(404).end();
        const imageRes = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`);
        if (!imageRes.ok) return res.status(404).end();
        res.setHeader('Content-Type', imageRes.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=600');
        return res.status(200).send(Buffer.from(await imageRes.arrayBuffer()));
      } catch { return res.status(502).end(); }
    }

    // ════════════════════════════════════════════════════════════════════════
    // POST /api/telegram/claim
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/claim' && method === 'POST') {
      if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });
      const { initData } = body;
      const amount = Number(body.amount);
      if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData is required' });
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_CLAIM) return res.status(400).json({ error: 'Invalid amount' });

      const user = verifyTelegramUser(initData);
      if (!user) return res.status(401).json({ error: 'Invalid or expired Telegram initData' });
      const db = getPool();
      if (!db) return res.status(503).json({ error: 'Database not available' });

      try {
        await db.query(
          `INSERT INTO gm_users (telegram_id, first_name, last_name, username, last_active_at)
           VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (telegram_id) DO UPDATE SET last_active_at=NOW()`,
          [user.id, user.first_name ?? null, user.last_name ?? null, user.username ?? null]
        );
        const { rows } = await db.query(
          `UPDATE gm_users SET balance = balance + $2, last_active_at=NOW() WHERE telegram_id=$1 RETURNING balance`,
          [user.id, amount]
        );
        return res.status(200).json({ balance: rows[0]?.balance ?? amount });
      } catch (e) {
        console.error('Claim DB error:', e?.message);
        return res.status(500).json({ error: 'Failed to persist claim' });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // POST/DELETE /api/telegram/wallet
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/wallet') {
      if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });
      const { initData } = body;
      if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData required' });
      const user = verifyTelegramUser(initData);
      if (!user) return res.status(401).json({ error: 'Invalid initData' });
      const db = getPool();
      if (!db) return res.status(503).json({ error: 'DB not available' });
      await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS wallet_address text`).catch(() => {});

      if (method === 'DELETE') {
        await db.query(`UPDATE gm_users SET wallet_address=NULL WHERE telegram_id=$1`, [user.id]);
        return res.json({ ok: true });
      }
      if (method === 'POST') {
        const { address } = body;
        if (!address || typeof address !== 'string') return res.status(400).json({ error: 'address required' });
        const { rows } = await db.query(
          `SELECT telegram_id FROM gm_users WHERE wallet_address=$1 AND telegram_id!=$2 LIMIT 1`,
          [address, user.id]
        );
        if (rows.length > 0) return res.status(409).json({ message: 'هذا العنوان مرتبط بحساب آخر بالفعل' });
        await db.query(
          `INSERT INTO gm_users (telegram_id, first_name, wallet_address, last_active_at)
           VALUES ($1,$2,$3,NOW()) ON CONFLICT (telegram_id) DO UPDATE SET wallet_address=$3, last_active_at=NOW()`,
          [user.id, user.first_name ?? null, address]
        );
        return res.json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ════════════════════════════════════════════════════════════════════════
    // POST /api/telegram/withdraw
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/withdraw' && method === 'POST') {
      if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });
      const initData = body.initData || req.headers['x-init-data'];
      const amount   = Number(body.amount);
      if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData required' });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
      if (amount < MIN_WITHDRAW) return res.status(400).json({ error: `الحد الأدنى للسحب هو ${MIN_WITHDRAW} gram` });

      const user = verifyTelegramUser(initData);
      if (!user) return res.status(401).json({ error: 'Invalid initData' });
      const db = getPool();
      if (!db) return res.status(503).json({ error: 'DB not available' });

      await db.query(`ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS wallet_address text`).catch(() => {});
      await db.query(`
        CREATE TABLE IF NOT EXISTS gm_withdrawals (
          id serial PRIMARY KEY, telegram_id bigint NOT NULL,
          wallet_address text NOT NULL, amount double precision NOT NULL,
          status text NOT NULL DEFAULT 'pending', tx_hash text,
          rejection_reason text, created_at timestamp NOT NULL DEFAULT NOW(), processed_at timestamp
        )
      `).catch(() => {});

      const { rows: userRows } = await db.query(
        `SELECT balance, wallet_address FROM gm_users WHERE telegram_id=$1`, [user.id]
      );
      const dbUser = userRows[0];
      if (!dbUser) return res.status(404).json({ error: 'User not found' });
      if (!dbUser.wallet_address) return res.status(400).json({ error: 'لم تربط محفظة TON بعد. اربط محفظتك أولاً.' });
      const balance = Number(dbUser.balance ?? 0);
      if (balance < amount) return res.status(400).json({ error: `الرصيد غير كافٍ (${balance.toFixed(4)} gram)` });

      const { rows: pending } = await db.query(
        `SELECT id FROM gm_withdrawals WHERE telegram_id=$1 AND status='pending' LIMIT 1`, [user.id]
      );
      if (pending.length > 0) return res.status(400).json({ error: 'لديك طلب سحب معلق بالفعل. انتظر معالجته أولاً.' });

      await db.query(
        `UPDATE gm_users SET balance=ROUND(CAST(balance AS numeric)-CAST($1 AS numeric),6)::double precision WHERE telegram_id=$2`,
        [amount, user.id]
      );
      const { rows: ins } = await db.query(
        `INSERT INTO gm_withdrawals (telegram_id, wallet_address, amount) VALUES ($1,$2,$3) RETURNING id`,
        [user.id, dbUser.wallet_address, amount]
      );
      const withdrawalId = ins[0]?.id;

      for (const adminId of ADMIN_IDS) {
        await sendTg(adminId,
          `💸 <b>طلب سحب جديد #${withdrawalId}</b>\n\n` +
          `👤 ${user.first_name ?? 'Miner'} (ID: ${user.id})\n` +
          `💰 المبلغ: <b>${amount.toFixed(4)} gram</b>\n` +
          `📬 المحفظة: <code>${dbUser.wallet_address}</code>\n\nللموافقة أو الرفض: لوحة الإدارة`
        );
      }

      return res.json({
        ok: true, withdrawalId,
        message: `✅ تم استلام طلب السحب (${amount.toFixed(4)} gram). سيتم معالجته قريباً.`,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET /api/telegram/withdraw/status
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/withdraw/status' && method === 'GET') {
      if (!TOKEN) return res.json([]);
      const initData = req.headers['x-init-data'];
      if (!initData) return res.json([]);
      const user = verifyTelegramUser(initData);
      if (!user) return res.json([]);
      const db = getPool();
      if (!db) return res.json([]);
      try {
        const { rows } = await db.query(
          `SELECT id, amount, status, tx_hash, rejection_reason, created_at, processed_at
           FROM gm_withdrawals WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 10`,
          [user.id]
        );
        return res.json(rows);
      } catch { return res.json([]); }
    }

    // ════════════════════════════════════════════════════════════════════════
    // POST /api/telegram/deposit/tonconnect
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/deposit/tonconnect' && method === 'POST') {
      if (!TOKEN) return res.status(503).json({ error: 'BOT_TOKEN not set' });
      const initData   = body.initData || req.headers['x-init-data'];
      const boc        = body.boc;
      const amountGram = Number(body.amountGram);

      if (!initData || typeof initData !== 'string') return res.status(400).json({ error: 'initData required' });
      if (!boc || typeof boc !== 'string')           return res.status(400).json({ error: 'boc required' });
      if (!Number.isFinite(amountGram) || amountGram <= 0) return res.status(400).json({ error: 'amountGram must be positive' });

      const user = verifyTelegramUser(initData);
      if (!user) return res.status(401).json({ error: 'Invalid initData' });
      const db = getPool();
      if (!db) return res.status(503).json({ error: 'DB not available' });

      await db.query(`
        CREATE TABLE IF NOT EXISTS gm_deposits (
          id serial PRIMARY KEY, telegram_id bigint NOT NULL, wallet_address text NOT NULL,
          tx_hash text NOT NULL UNIQUE, amount double precision NOT NULL,
          status text NOT NULL DEFAULT 'pending', confirmations integer NOT NULL DEFAULT 0,
          credited_at timestamp, created_at timestamp NOT NULL DEFAULT NOW(), processed_at timestamp
        )
      `).catch(() => {});
      await db.query(`ALTER TABLE gm_deposits ADD COLUMN IF NOT EXISTS ton_boc text`).catch(() => {});

      const bocHash = `tonconnect:${Buffer.from(boc).toString('base64').slice(0, 64)}`;
      let depositId;
      try {
        const { rows } = await db.query(
          `INSERT INTO gm_deposits (telegram_id, wallet_address, tx_hash, amount, status, confirmations, credited_at, processed_at)
           VALUES ($1,'tonconnect',$2,$3,'confirmed',1,NOW(),NOW()) RETURNING id`,
          [user.id, bocHash, amountGram]
        );
        depositId = rows[0]?.id;
      } catch (e) {
        if (e?.code === '23505') return res.status(409).json({ error: 'هذه المعاملة تمت معالجتها بالفعل.' });
        throw e;
      }

      db.query(`UPDATE gm_deposits SET ton_boc=$1 WHERE id=$2`, [boc.slice(0, 2000), depositId]).catch(() => {});

      await db.query(
        `INSERT INTO gm_users (telegram_id, first_name, balance, last_active_at)
         VALUES ($1,$2,0,NOW()) ON CONFLICT (telegram_id) DO NOTHING`,
        [user.id, user.first_name ?? null]
      );
      const { rows: balRows } = await db.query(
        `UPDATE gm_users
         SET balance=ROUND(CAST(balance AS numeric)+CAST($1 AS numeric),6)::double precision, last_active_at=NOW()
         WHERE telegram_id=$2 RETURNING balance`,
        [amountGram, user.id]
      );
      const newBalance = balRows[0]?.balance ?? amountGram;

      await sendTg(user.id, `✅ <b>تم تأكيد الإيداع!</b>\n\n💰 المبلغ: <b>${amountGram.toFixed(4)} gram</b>\n\nتم إضافة الرصيد لحسابك تلقائياً.`);
      for (const adminId of ADMIN_IDS) {
        await sendTg(adminId, `💰 <b>إيداع TON Connect جديد #${depositId}</b>\n\n👤 ${user.first_name ?? 'Miner'} (ID: ${user.id})\n💵 المبلغ: ${amountGram.toFixed(4)} gram\n✅ مضاف تلقائياً`);
      }

      return res.json({ ok: true, depositId, balance: newBalance, message: `✅ تم إيداع ${amountGram.toFixed(4)} gram وإضافته لرصيدك.` });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET /api/telegram/deposit/status
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/telegram/deposit/status' && method === 'GET') {
      if (!TOKEN) return res.json([]);
      const initData = req.headers['x-init-data'];
      if (!initData) return res.json([]);
      const user = verifyTelegramUser(initData);
      if (!user) return res.json([]);
      const db = getPool();
      if (!db) return res.json([]);
      try {
        const { rows } = await db.query(
          `SELECT id, amount, status, created_at FROM gm_deposits WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 10`,
          [user.id]
        );
        return res.json(rows);
      } catch { return res.json([]); }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ADMIN ROUTES — all require verifyAdmin
    // ════════════════════════════════════════════════════════════════════════

    // GET,POST /api/admin/general   ?type=stats|settings|broadcast|combo
    if (path === '/api/admin/general') {
      const db    = getPool();
      const admin = await verifyAdmin(req, db);
      if (!admin) return res.status(403).json({ error: 'Forbidden' });
      const { type } = query;

      if (type === 'stats' && method === 'GET') {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const [total, blocked, active] = await Promise.all([
          db.query('SELECT COUNT(*) FROM gm_users'),
          db.query('SELECT COUNT(*) FROM gm_users WHERE blocked_bot=true'),
          db.query('SELECT COUNT(*) FROM gm_users WHERE last_active_at>$1', [fiveMinAgo]),
        ]);
        return res.json({
          totalUsers: Number(total.rows[0].count),
          blockedUsers: Number(blocked.rows[0].count),
          activeUsers: Number(active.rows[0].count),
        });
      }

      if (type === 'settings' && method === 'GET') {
        const { rows } = await db.query('SELECT key, value FROM gm_settings');
        return res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
      }

      if (type === 'settings' && method === 'POST') {
        const { key, value } = body;
        if (!key) return res.status(400).json({ error: 'key required' });
        await db.query(
          `INSERT INTO gm_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
          [key, String(value ?? '')]
        );
        return res.json({ ok: true });
      }

      if (type === 'broadcast' && method === 'POST') {
        const { message } = body;
        if (!message?.trim()) return res.status(400).json({ error: 'message required' });
        const { rows } = await db.query(`SELECT telegram_id FROM gm_users WHERE blocked_bot=false OR blocked_bot IS NULL`);
        let sent = 0, failed = 0;
        for (const row of rows) {
          const ok = await sendTg(row.telegram_id, message).then(r => r?.ok);
          ok ? sent++ : failed++;
          await new Promise(r => setTimeout(r, 50));
        }
        return res.json({ ok: true, sent, failed, total: rows.length });
      }

      if (type === 'combo' && method === 'GET') {
        const ITEM_NAMES = { 1:'Crystal Core',2:'Mining Pickaxe',3:'Mining Rig',4:'Server Node',5:'Treasure Vault' };
        const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key='daily_combo'`);
        if (!rows.length) return res.json({ date: null, correctIds: [], correctNames: [] });
        const combo = JSON.parse(rows[0].value);
        return res.json({ date: combo.date, correctIds: combo.correctIds, correctNames: combo.correctIds.map(id => ITEM_NAMES[id] || `Item ${id}`) });
      }

      return res.status(400).json({ error: 'Invalid type or method' });
    }

    // GET,POST,DELETE /api/admin/admins  (sub-admins)
    if (path === '/api/admin/admins') {
      const db    = getPool();
      const admin = await verifyAdmin(req, db);
      if (!admin?.isMainAdmin) return res.status(403).json({ error: 'Only main admin' });

      const getSubs  = async () => { const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key='sub_admins'`); return rows[0] ? JSON.parse(rows[0].value) : []; };
      const saveSubs = async (subs) => { await db.query(`INSERT INTO gm_settings (key,value) VALUES ('sub_admins',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(subs)]); };

      if (method === 'GET') return res.json(await getSubs());

      if (method === 'POST') {
        const { telegramId, username = '', permissions = [] } = body;
        if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
        const subs = await getSubs();
        const idx  = subs.findIndex(s => s.telegramId === Number(telegramId));
        if (idx >= 0) { subs[idx].permissions = permissions; }
        else          { subs.push({ telegramId: Number(telegramId), username, permissions }); }
        await saveSubs(subs);
        return res.json({ ok: true });
      }

      if (method === 'DELETE') {
        const tid  = query.telegramId;
        const subs = (await getSubs()).filter(s => s.telegramId !== Number(tid));
        await saveSubs(subs);
        return res.json({ ok: true });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET,POST,DELETE /api/admin/channels
    if (path === '/api/admin/channels') {
      const db    = getPool();
      const admin = await verifyAdmin(req, db);
      if (!admin) return res.status(403).json({ error: 'Forbidden' });

      if (method === 'GET') {
        const { rows } = await db.query('SELECT * FROM gm_channels ORDER BY created_at');
        return res.json(rows.map(r => ({ id: r.id, channelUsername: r.channel_username, channelName: r.channel_name })));
      }
      if (method === 'POST') {
        const { channelUsername, channelName = '' } = body;
        if (!channelUsername) return res.status(400).json({ error: 'channelUsername required' });
        const clean = channelUsername.replace(/^@/, '');
        const { rows } = await db.query(
          `INSERT INTO gm_channels (channel_username, channel_name) VALUES ($1,$2) RETURNING *`,
          [clean, channelName]
        );
        const r = rows[0];
        return res.json({ id: r.id, channelUsername: r.channel_username, channelName: r.channel_name });
      }
      if (method === 'DELETE') {
        const { id } = query;
        if (!id) return res.status(400).json({ error: 'id required' });
        await db.query('DELETE FROM gm_channels WHERE id=$1', [Number(id)]);
        return res.json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET,POST /api/admin/miners
    if (path === '/api/admin/miners') {
      const db    = getPool();
      const admin = await verifyAdmin(req, db);
      if (!admin) return res.status(403).json({ error: 'Forbidden' });

      if (method === 'GET') {
        try {
          const { rows } = await db.query(`SELECT value FROM gm_settings WHERE key='miners_config'`);
          return res.json(rows[0] ? JSON.parse(rows[0].value) : DEFAULT_MINERS);
        } catch { return res.json(DEFAULT_MINERS); }
      }
      if (method === 'POST') {
        const { miners } = body;
        if (!Array.isArray(miners)) return res.status(400).json({ error: 'miners array required' });
        await db.query(
          `INSERT INTO gm_settings (key,value) VALUES ('miners_config',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
          [JSON.stringify(miners)]
        );
        return res.json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET,POST,PATCH,DELETE /api/admin/tasks
    if (path === '/api/admin/tasks') {
      const db    = getPool();
      const admin = await verifyAdmin(req, db);
      if (!admin) return res.status(403).json({ error: 'Forbidden' });

      if (method === 'GET') {
        const { rows } = await db.query('SELECT * FROM gm_tasks ORDER BY created_at DESC');
        return res.json(rows.map(r => ({ id: r.id, title: r.title, description: r.description, reward: r.reward, isDaily: r.is_daily, isHidden: r.is_hidden })));
      }
      if (method === 'POST') {
        const { title, description = '', reward = 0, isDaily = false } = body;
        if (!title) return res.status(400).json({ error: 'title required' });
        const { rows } = await db.query(
          `INSERT INTO gm_tasks (title,description,reward,is_daily) VALUES ($1,$2,$3,$4) RETURNING *`,
          [title, description, Number(reward), Boolean(isDaily)]
        );
        const r = rows[0];
        return res.json({ id: r.id, title: r.title, description: r.description, reward: r.reward, isDaily: r.is_daily, isHidden: r.is_hidden });
      }
      if (method === 'DELETE') {
        const { id } = query;
        if (!id) return res.status(400).json({ error: 'id required' });
        await db.query('DELETE FROM gm_tasks WHERE id=$1', [Number(id)]);
        return res.json({ ok: true });
      }
      if (method === 'PATCH') {
        const { id } = query;
        if (!id) return res.status(400).json({ error: 'id required' });
        const fields = [], vals = [];
        let idx = 1;
        if (body.title       !== undefined) { fields.push(`title=$${idx++}`);       vals.push(body.title); }
        if (body.description !== undefined) { fields.push(`description=$${idx++}`); vals.push(body.description); }
        if (body.reward      !== undefined) { fields.push(`reward=$${idx++}`);      vals.push(Number(body.reward)); }
        if (body.isDaily     !== undefined) { fields.push(`is_daily=$${idx++}`);    vals.push(Boolean(body.isDaily)); }
        if (body.isHidden    !== undefined) { fields.push(`is_hidden=$${idx++}`);   vals.push(Boolean(body.isHidden)); }
        if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
        vals.push(Number(id));
        await db.query(`UPDATE gm_tasks SET ${fields.join(',')} WHERE id=$${idx}`, vals);
        return res.json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // GET,POST,DELETE /api/admin/users
    if (path === '/api/admin/users') {
      const db    = getPool();
      const admin = await verifyAdmin(req, db);
      if (!admin) return res.status(403).json({ error: 'Forbidden' });

      const { action, q } = query;
      const telegramId = query.id || query.telegramId;

      if (action === 'search' && method === 'GET') {
        const qStr = String(q || '').trim();
        if (!qStr) return res.json([]);
        const { rows } = await db.query(
          `SELECT id,telegram_id,username,first_name,last_name,balance,is_banned,restrict_withdrawal,blocked_bot
           FROM gm_users WHERE telegram_id::text=$1 OR username ILIKE $2 OR first_name ILIKE $2 LIMIT 20`,
          [qStr, `%${qStr}%`]
        );
        return res.json(rows.map(u => ({
          id: u.id, telegramId: u.telegram_id, username: u.username,
          firstName: u.first_name, lastName: u.last_name, balance: u.balance,
          isBanned: u.is_banned, restrictWithdrawal: u.restrict_withdrawal, blockedBot: u.blocked_bot,
        })));
      }

      if (action === 'balance' && method === 'POST') {
        const amount = Number(body?.amount);
        if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Invalid amount' });
        const { rows } = await db.query(
          `UPDATE gm_users SET balance=GREATEST(0,balance+$1),last_active_at=NOW() WHERE telegram_id=$2 RETURNING balance`,
          [amount, Number(telegramId)]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        return res.json({ ok: true, balance: rows[0].balance });
      }

      if (action === 'balance_set' && method === 'POST') {
        const value = Number(body?.value);
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Invalid value' });
        const { rows } = await db.query(
          `UPDATE gm_users SET balance=$1,last_active_at=NOW() WHERE telegram_id=$2 RETURNING balance`,
          [value, Number(telegramId)]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        return res.json({ ok: true, balance: rows[0].balance });
      }

      if (action === 'ban' && method === 'POST') {
        await db.query('UPDATE gm_users SET is_banned=$1 WHERE telegram_id=$2', [Boolean(body?.ban), Number(telegramId)]);
        return res.json({ ok: true, isBanned: Boolean(body?.ban) });
      }

      if (action === 'restrict' && method === 'POST') {
        await db.query('UPDATE gm_users SET restrict_withdrawal=$1 WHERE telegram_id=$2', [Boolean(body?.restrict), Number(telegramId)]);
        return res.json({ ok: true, restrictWithdrawal: Boolean(body?.restrict) });
      }

      if (action === 'warn' && method === 'POST') {
        const message = String(body?.message || '').trim();
        if (!message) return res.status(400).json({ error: 'message required' });
        const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: Number(telegramId), text: `⚠️ تحذير من الإدارة:\n\n${message}`, parse_mode: 'HTML' }),
        });
        const data = await r.json();
        if (!data.ok) return res.status(500).json({ error: data.description });
        return res.json({ ok: true });
      }

      if (method === 'DELETE') {
        if (!telegramId) return res.status(400).json({ error: 'id required' });
        const { rowCount } = await db.query(`DELETE FROM gm_users WHERE telegram_id=$1`, [Number(telegramId)]);
        if (!rowCount) return res.status(404).json({ error: 'User not found' });
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'Invalid action or method' });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET /api/leaderboard — top 20 users by gram balance (public, no auth)
    // ════════════════════════════════════════════════════════════════════════
    if (path === '/api/leaderboard' && method === 'GET') {
      const db = getPool();
      if (!db) return res.json([]);
      try {
        const { rows } = await db.query(`
          SELECT telegram_id, first_name, last_name, username, balance
          FROM gm_users
          WHERE is_banned = false
          ORDER BY balance DESC
          LIMIT 20
        `);
        return res.json(rows.map((r, i) => ({
          rank:       i + 1,
          telegramId: Number(r.telegram_id),
          firstName:  r.first_name  ?? null,
          lastName:   r.last_name   ?? null,
          username:   r.username    ?? null,
          balance:    Number(r.balance),
        })));
      } catch { return res.json([]); }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 404 fallback
    // ════════════════════════════════════════════════════════════════════════
    return res.status(404).json({ error: 'Not found', path });

  } catch (err) {
    console.error('Unhandled error in api/index.js:', err?.message, err?.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
