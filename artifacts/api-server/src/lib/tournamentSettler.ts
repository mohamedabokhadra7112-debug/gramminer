/**
 * Background tournament settler.
 * Every 30 seconds, checks for active tournaments whose end_at has passed
 * and automatically settles them: awards prizes, notifies users and admin.
 */

import { logger } from "./logger";

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

async function sendMsg(chatId: number | string, text: string) {
  const token = getBotToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

function getAdminIds(): number[] {
  const env = process.env["ADMIN_ID"];
  if (!env) return [6145230334, 868999453];
  return env.split(",").map(Number).filter(Number.isFinite);
}

interface Prize { rank: number; gram: number }

export async function settleTournamentNow(tournamentId: number) {
  return settleTournament(tournamentId);
}

async function settleTournament(tournamentId: number) {
  const { pool } = await import("@workspace/db");

  // Lock row — set status to 'settling' so concurrent runs skip it
  const lockRes = await pool.query<{ id: number; title: string; top_n: number; prizes: string }>(
    `UPDATE gm_tournaments
     SET status = 'settling'
     WHERE id = $1 AND status = 'active'
     RETURNING id, title, top_n, prizes`,
    [tournamentId],
  );
  if (lockRes.rows.length === 0) return; // already being settled or settled

  const row = lockRes.rows[0]!;
  const title  = row.title;
  const topN   = row.top_n;
  const prizes: Prize[] = JSON.parse(row.prizes);

  logger.info({ tournamentId, title }, "Settling tournament");

  // Get top-N users
  const lbRes = await pool.query<{
    telegram_id: string; first_name: string | null;
    last_name: string | null; username: string | null; balance: string;
  }>(
    `SELECT telegram_id, first_name, last_name, username, balance
     FROM gm_users WHERE is_banned = false
     ORDER BY balance DESC LIMIT $1`,
    [topN],
  );

  const winners = lbRes.rows.map((r, i) => ({
    rank:       i + 1,
    telegramId: Number(r.telegram_id),
    firstName:  r.first_name ?? null,
    username:   r.username   ?? null,
    balance:    Number(r.balance),
    prize:      prizes.find(p => p.rank === i + 1)?.gram ?? 0,
  }));

  // Award prizes and notify winners
  for (const w of winners) {
    if (w.prize <= 0) continue;
    try {
      await pool.query(
        `UPDATE gm_users
         SET balance = ROUND(CAST(balance AS numeric) + CAST($1 AS numeric), 6)::double precision
         WHERE telegram_id = $2`,
        [w.prize, w.telegramId],
      );

      const rankEmoji = w.rank === 1 ? "🥇" : w.rank === 2 ? "🥈" : w.rank === 3 ? "🥉" : `#${w.rank}`;
      const name = w.firstName ?? `user${w.telegramId}`;
      await sendMsg(
        w.telegramId,
        `🏆 <b>انتهت المسابقة!</b>\n\n` +
        `<b>${title}</b>\n\n` +
        `${rankEmoji} مبروك <b>${name}</b>!\n` +
        `لقد حصلت على المركز <b>${w.rank}</b>\n` +
        `🎁 مكافأتك: <b>${w.prize} gram</b>\n\n` +
        `تم إضافة المكافأة لرصيدك فوراً ✅`,
      );
    } catch (err) {
      logger.error({ err, telegramId: w.telegramId }, "Failed to award prize");
    }
  }

  // Build admin summary
  const lines = winners.map(w => {
    const rankEmoji = w.rank === 1 ? "🥇" : w.rank === 2 ? "🥈" : w.rank === 3 ? "🥉" : `${w.rank}.`;
    const name = w.firstName ?? `user${w.telegramId}`;
    const prizeStr = w.prize > 0 ? ` ← +${w.prize} gram` : "";
    return `${rankEmoji} ${name}: ${w.balance.toFixed(4)} gram${prizeStr}`;
  });

  const adminMsg =
    `🏆 <b>انتهت المسابقة</b>\n\n` +
    `<b>${title}</b>\n\n` +
    `<b>النتائج النهائية:</b>\n${lines.join("\n")}\n\n` +
    `✅ تم توزيع الجوائز على الفائزين تلقائياً`;

  for (const adminId of getAdminIds()) {
    await sendMsg(adminId, adminMsg);
  }

  // Mark as settled
  const snapshot = JSON.stringify(winners);
  await pool.query(
    `UPDATE gm_tournaments
     SET status = 'settled', snapshot = $1, settled_at = NOW()
     WHERE id = $2`,
    [snapshot, tournamentId],
  );

  logger.info({ tournamentId, title, winners: winners.length }, "Tournament settled");
}

export function startTournamentSettler() {
  setInterval(async () => {
    try {
      const { pool } = await import("@workspace/db");
      const res = await pool.query<{ id: number }>(
        `SELECT id FROM gm_tournaments
         WHERE status = 'active' AND ends_at <= NOW()`,
      );
      for (const row of res.rows) {
        await settleTournament(row.id).catch(err =>
          logger.error({ err, tournamentId: row.id }, "Tournament settle error"),
        );
      }
    } catch {
      // DB not yet available — skip silently
    }
  }, 30_000);

  logger.info("Tournament settler started (30s interval)");
}
