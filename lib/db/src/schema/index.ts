import {
  pgTable,
  serial,
  integer,
  text,
  bigint,
  doublePrecision,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersTable = pgTable("gm_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  balance: doublePrecision("balance").notNull().default(0),
  coins: integer("coins").notNull().default(0),
  walletAddress: text("wallet_address"),
  isBanned: boolean("is_banned").notNull().default(false),
  restrictWithdrawal: boolean("restrict_withdrawal").notNull().default(false),
  blockedBot: boolean("blocked_bot").notNull().default(false),
  language: text("language"),
  referredBy: bigint("referred_by", { mode: "number" }),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Settings (key-value store) ───────────────────────────────────────────────
export const settingsTable = pgTable("gm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksTable = pgTable("gm_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  reward: doublePrecision("reward").notNull().default(0),
  isDaily: boolean("is_daily").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  channelUsername: text("channel_username"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Task completions (server-side tracking) ─────────────────────────────────
export const taskCompletionsTable = pgTable(
  "gm_task_completions",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    taskId: integer("task_id").notNull(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.telegramId, t.taskId)],
);

// ─── Referrals ────────────────────────────────────────────────────────────────
export const referralsTable = pgTable(
  "gm_referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: bigint("referrer_id", { mode: "number" }).notNull(),
    referredId: bigint("referred_id", { mode: "number" }).notNull(),
    rewardPaid: boolean("reward_paid").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.referredId)], // each new user can only have one referrer
);

// ─── Mandatory channels ───────────────────────────────────────────────────────
export const channelsTable = pgTable("gm_channels", {
  id: serial("id").primaryKey(),
  channelUsername: text("channel_username").notNull(),
  channelName: text("channel_name").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Withdrawals ─────────────────────────────────────────────────────────────
export const withdrawalsTable = pgTable("gm_withdrawals", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  walletAddress: text("wallet_address").notNull(),
  amount: doublePrecision("amount").notNull(),
  /** pending | approved | rejected */
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

// ─── Earnings log (rolling 24-hour tracking) ─────────────────────────────────
// Each successful mining claim writes one row here so we can SUM(amount)
// over the last 24 hours without touching the aggregate balance column.
export const earningsLogTable = pgTable("gm_earnings_log", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  amount: doublePrecision("amount").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Daily Combo Attempts ─────────────────────────────────────────────────────
export const comboAttemptsTable = pgTable(
  "gm_combo_attempts",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    comboDate: text("combo_date").notNull(), // "YYYY-MM-DD"
    success: boolean("success").notNull(),
    reward: integer("reward").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.telegramId, t.comboDate)],
);

export type User = typeof usersTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
export type Channel = typeof channelsTable.$inferSelect;
export type Withdrawal = typeof withdrawalsTable.$inferSelect;
