/**
 * User preference routes — language selection.
 * GET  /api/user/language  → returns { language: "ar" | "en" }
 * POST /api/user/language  → saves { initData, language } to DB
 */
import { Router, type IRouter } from "express";
import { verifyInitData } from "../lib/telegramAuth";
import { getDb } from "../lib/db";

const router: IRouter = Router();

function getBotToken() {
  return process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
}

// Lazy migration: add language column if not yet present.
let migrated = false;
async function ensureLanguageColumn() {
  if (migrated) return;
  try {
    const { pool } = await import("@workspace/db");
    await pool.query(
      `ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS language text`,
    );
  } catch { /* ignore — column may already exist or DB unavailable */ }
  migrated = true;
}

// ── GET /api/user/language ────────────────────────────────────────────────────
router.get("/user/language", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const initData = req.headers["x-init-data"] as string | undefined;
  if (!initData) { res.status(400).json({ error: "x-init-data header required" }); return; }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureLanguageColumn();
  const db = await getDb();
  if (!db) { res.status(200).json({ language: "ar" }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ language: usersTable.language })
      .from(usersTable)
      .where(eq(usersTable.telegramId, user.id));
    res.status(200).json({ language: row?.language ?? "ar" });
  } catch {
    res.status(200).json({ language: "ar" });
  }
});

// ── POST /api/user/language ───────────────────────────────────────────────────
router.post("/user/language", async (req, res): Promise<void> => {
  const token = getBotToken();
  if (!token) { res.status(503).json({ error: "BOT_TOKEN not set" }); return; }

  const { initData, language } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof initData !== "string" || !initData) {
    res.status(400).json({ error: "initData required" }); return;
  }
  if (language !== "ar" && language !== "en") {
    res.status(400).json({ error: "language must be 'ar' or 'en'" }); return;
  }

  const user = verifyInitData(initData, token);
  if (!user) { res.status(401).json({ error: "Invalid initData" }); return; }

  await ensureLanguageColumn();
  const db = await getDb();
  if (!db) { res.status(200).json({ ok: true }); return; }

  try {
    const { usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(usersTable)
      .set({ language: language as string })
      .where(eq(usersTable.telegramId, user.id));
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

export default router;
