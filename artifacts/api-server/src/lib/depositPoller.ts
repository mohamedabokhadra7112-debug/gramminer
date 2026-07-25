/**
 * Auto Deposit Poller — detects incoming TON transactions to the bot wallet
 * and automatically credits user gram balances.
 *
 * Flow:
 *   1. Every 60s, poll TON Center API for transactions to OWNER_WALLET
 *   2. For each incoming tx, read the comment (memo)
 *   3. If comment is a numeric telegram_id → find user → credit balance
 *   4. Mark the tx hash as processed in gm_deposits to prevent double-credit
 *
 * Env vars required:
 *   OWNER_WALLET  — the bot's TON wallet address
 *   BOT_TOKEN     — to notify user on Telegram after credit
 *   TONCENTER_API_KEY — optional; increases rate limit
 */

import { logger } from "./logger";

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const TON_CENTER = "https://toncenter.com/api/v2";

let schemaMigrated = false;

async function ensureDepositSchema() {
  if (schemaMigrated) return;
  schemaMigrated = true;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gm_deposits (
        id           serial PRIMARY KEY,
        telegram_id  bigint NOT NULL,
        tx_hash      text   NOT NULL UNIQUE,
        amount_gram  double precision NOT NULL,
        source_addr  text,
        status       text NOT NULL DEFAULT 'confirmed',
        created_at   timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS gm_deposits_tid_idx ON gm_deposits (telegram_id)`,
    );
  } catch (e) {
    logger.warn({ e }, "depositPoller: schema migration skipped");
  }
}

interface TonCenterTx {
  transaction_id: { lt: string; hash: string };
  utime: number;
  in_msg: {
    source?: string;
    destination?: string;
    value?: string;
    message?: string;
    msg_data?: { type?: string; text?: string };
  };
}

async function fetchRecentTxs(ownerWallet: string): Promise<TonCenterTx[]> {
  const apiKey = process.env["TONCENTER_API_KEY"] ?? "";
  const url = `${TON_CENTER}/getTransactions?address=${encodeURIComponent(ownerWallet)}&limit=50${apiKey ? `&api_key=${apiKey}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TonCenter ${res.status}`);
  const json = await res.json() as { ok: boolean; result?: TonCenterTx[] };
  if (!json.ok || !Array.isArray(json.result)) return [];
  return json.result;
}

function extractComment(tx: TonCenterTx): string {
  // Try plain message text first
  const msg = tx.in_msg?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  // Some nodes encode it in msg_data.text (base64)
  const textB64 = tx.in_msg?.msg_data?.text;
  if (typeof textB64 === "string") {
    try { return Buffer.from(textB64, "base64").toString("utf8").trim(); } catch { /* skip */ }
  }
  return "";
}

async function notifyUser(telegramId: number, amountGram: number) {
  const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramId,
      text:
        `✅ <b>تم الإيداع بنجاح!</b>\n\n` +
        `💎 المبلغ: <b>${amountGram.toFixed(4)} gram</b>\n` +
        `رصيدك تم تحديثه تلقائياً.`,
      parse_mode: "HTML",
    }),
  }).catch(() => {});
}

async function runPollCycle(ownerWallet: string) {
  const { pool } = await import("@workspace/db");

  let txs: TonCenterTx[];
  try {
    txs = await fetchRecentTxs(ownerWallet);
  } catch (err) {
    logger.warn({ err }, "depositPoller: fetchRecentTxs failed");
    return;
  }

  for (const tx of txs) {
    // Only care about incoming messages (in_msg.destination === ownerWallet)
    const dest = tx.in_msg?.destination ?? "";
    if (!dest.toLowerCase().includes(ownerWallet.toLowerCase().slice(-8))) continue;

    const txHash = tx.transaction_id.hash;
    const comment = extractComment(tx);

    // Comment must be a numeric telegram_id
    if (!comment || !/^\d+$/.test(comment)) continue;

    const telegramId = parseInt(comment, 10);
    const nanotons = BigInt(tx.in_msg?.value ?? "0");
    const amountGram = Number(nanotons) / 1e9; // 1 TON = 1 gram

    if (amountGram < 0.001) continue; // too small, ignore dust

    // Check if already processed
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM gm_deposits WHERE tx_hash = $1 LIMIT 1`,
      [txHash],
    );
    if (existing.rows.length > 0) continue;

    // Find user
    const userRow = await pool.query<{ telegram_id: string; balance: number }>(
      `SELECT telegram_id, balance FROM gm_users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId],
    );
    if (!userRow.rows.length) {
      logger.warn({ telegramId, txHash }, "depositPoller: user not found for telegram_id in memo");
      continue;
    }

    try {
      // Credit balance
      await pool.query(
        `UPDATE gm_users
         SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision
         WHERE telegram_id = $2`,
        [amountGram, telegramId],
      );

      // Record deposit (UNIQUE on tx_hash prevents double-credit)
      await pool.query(
        `INSERT INTO gm_deposits (telegram_id, tx_hash, amount_gram, source_addr, status)
         VALUES ($1, $2, $3, $4, 'confirmed')
         ON CONFLICT (tx_hash) DO NOTHING`,
        [telegramId, txHash, amountGram, tx.in_msg?.source ?? null],
      );

      logger.info({ telegramId, amountGram, txHash }, "depositPoller: credited deposit");
      await notifyUser(telegramId, amountGram);
    } catch (err) {
      logger.error({ err, telegramId, txHash }, "depositPoller: failed to credit deposit");
    }
  }
}

export function startDepositPoller() {
  const ownerWallet = process.env["OWNER_WALLET"] ?? process.env["VITE_OWNER_WALLET"] ?? process.env["NEXT_PUBLIC_OWNER_WALLET"] ?? "";
  if (!ownerWallet) {
    logger.warn("depositPoller: OWNER_WALLET not set — auto-deposit disabled");
    return;
  }

  logger.info({ ownerWallet }, "Deposit poller started (60s interval)");

  // First run after 30s
  setTimeout(async () => {
    await runPollCycle(ownerWallet).catch(err =>
      logger.error({ err }, "depositPoller initial run failed"),
    );
    setInterval(async () => {
      await runPollCycle(ownerWallet).catch(err =>
        logger.error({ err }, "depositPoller interval failed"),
      );
    }, POLL_INTERVAL_MS);
  }, 30_000);
}
