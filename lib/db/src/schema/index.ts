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
  /** channel | group | null (for non-social tasks) */
  taskType: text("task_type"),
  /** join_link for channel/group tasks */
  joinLink: text("join_link"),
  /** numeric chat id or @username used for getChatMember verification */
  chatId: text("chat_id"),
  /** enabled/disabled by admin */
  isEnabled: boolean("is_enabled").notNull().default(true),
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

// ─── Referral milestones ──────────────────────────────────────────────────────
export const referralMilestonesTable = pgTable("gm_referral_milestones", {
  id: serial("id").primaryKey(),
  inviteCount: integer("invite_count").notNull(),
  rewardCoins: integer("reward_coins").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Referral milestone credits (idempotency: one credit per user per milestone) ─
export const referralMilestoneCreditsTable = pgTable(
  "gm_referral_milestone_credits",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    milestoneId: integer("milestone_id").notNull(),
    creditedAt: timestamp("credited_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.telegramId, t.milestoneId)],
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

// ─── Deposits ─────────────────────────────────────────────────────────────────
export const depositsTable = pgTable("gm_deposits", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  amount: doublePrecision("amount").notNull(),
  /** pending | confirmed | rejected */
  status: text("status").notNull().default("pending"),
  confirmations: integer("confirmations").notNull().default(0),
  creditedAt: timestamp("credited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  rejectionReason: text("rejection_reason"),
});

// ─── Swaps (Gram <-> Coins) ───────────────────────────────────────────────────
export const swapsTable = pgTable("gm_swaps", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  /** gram_to_coins | coins_to_gram */
  direction: text("direction").notNull(),
  gramAmount: doublePrecision("gram_amount").notNull(),
  coinsAmount: integer("coins_amount").notNull(),
  rate: doublePrecision("rate").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Coin Store Products ──────────────────────────────────────────────────────
export const storeProductsTable = pgTable("gm_store_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  coinPrice: integer("coin_price").notNull(),
  gramValue: doublePrecision("gram_value").notNull().default(0),
  dailyMiningPct: doublePrecision("daily_mining_pct").notNull().default(0.05),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Coin Store Purchases / Ownership ────────────────────────────────────────
export const storePurchasesTable = pgTable("gm_store_purchases", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  productId: integer("product_id").notNull(),
  coinsPaid: integer("coins_paid").notNull(),
  gramValue: doublePrecision("gram_value").notNull().default(0),
  dailyMiningPct: doublePrecision("daily_mining_pct").notNull().default(0.05),
  /** principal remaining for mining; starts at gramValue */
  principalRemaining: doublePrecision("principal_remaining").notNull().default(0),
  lastClaimAt: timestamp("last_claim_at"),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
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
export type Deposit = typeof depositsTable.$inferSelect;
export type Swap = typeof swapsTable.$inferSelect;
export type StoreProduct = typeof storeProductsTable.$inferSelect;
export type StorePurchase = typeof storePurchasesTable.$inferSelect;
export type ReferralMilestone = typeof referralMilestonesTable.$inferSelect;
