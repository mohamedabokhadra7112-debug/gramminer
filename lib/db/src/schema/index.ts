import {
  pgTable,
  serial,
  text,
  bigint,
  doublePrecision,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersTable = pgTable("gm_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  balance: doublePrecision("balance").notNull().default(0),
  walletAddress: text("wallet_address"),
  isBanned: boolean("is_banned").notNull().default(false),
  restrictWithdrawal: boolean("restrict_withdrawal").notNull().default(false),
  blockedBot: boolean("blocked_bot").notNull().default(false),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Mandatory channels ───────────────────────────────────────────────────────
export const channelsTable = pgTable("gm_channels", {
  id: serial("id").primaryKey(),
  channelUsername: text("channel_username").notNull(),
  channelName: text("channel_name").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
export type Channel = typeof channelsTable.$inferSelect;
