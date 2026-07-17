import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getDb } from "./lib/db";
import { verifyInitData } from "./lib/telegramAuth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Maintenance mode middleware ───────────────────────────────────────────────
// Skips: admin routes, webhook, healthz, setup (so the bot and admin always work).
// For all other routes, checks the maintenance_mode setting in DB.
// Admins (matching ADMIN_ID) bypass maintenance mode.
app.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const path = req.path;
  // Always allow admin panel, webhook, health, setup
  if (
    path.startsWith("/api/admin") ||
    path.includes("/webhook") ||
    path.includes("/healthz") ||
    path.includes("/setup") ||
    path.includes("/avatar")
  ) {
    next(); return;
  }

  const db = await getDb();
  if (!db) { next(); return; }

  try {
    const { settingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "maintenance_mode"));
    if (row?.value !== "true") { next(); return; }

    // Maintenance is ON — check if request comes from admin
    const adminId = Number(process.env["ADMIN_ID"] ?? 0);
    const token = process.env["BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
    if (adminId && token) {
      const initData =
        (req.headers["x-init-data"] as string | undefined) ||
        (req.headers["x-telegram-initdata"] as string | undefined) ||
        (req.body?.initData as string | undefined);
      if (initData) {
        const user = verifyInitData(initData, token);
        if (user && user.id === adminId) { next(); return; }
      }
    }

    // Get maintenance message
    const [msgRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "maintenance_message"));
    const message = msgRow?.value || "🔧 البوت تحت الصيانة حاليًا، حاول لاحقًا";
    res.status(503).json({ error: "maintenance", message });
  } catch {
    // If DB check fails, let the request through
    next();
  }
});

app.use("/api", router);

export default app;
