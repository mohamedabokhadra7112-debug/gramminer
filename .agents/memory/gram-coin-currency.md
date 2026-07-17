---
name: gram/coin currency split
description: GMR renamed to "gram"; referrals earn "coins" (separate DB column, not gram balance); CoinsContext DB-synced; min withdrawal 0.1 gram.
---

## The Rule
- **gram** = main mining currency (withdrawable to TON; 700 gram = 1 TON). Used everywhere GMR was.
- **coin** = non-withdrawable purchase currency. Earned only from referrals (1 coin per referral). Spent in Miners page to buy/upgrade rigs.

## DB
- `gm_users.coins` column (integer, default 0) added to Drizzle schema in `lib/db/src/schema/index.ts`.
- Lazy `ALTER TABLE gm_users ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0` runs in: `withdraw.ts` ensureSchema, `getUserCoins()` in telegram.ts, referral credit block in telegram.ts, and `POST /api/telegram/coins/spend`.

## Backend changes
- `/telegram/auth` returns `{ user: { ...fields, balance, coins } }` — coins seeded from DB.
- Referral webhook credits `coins` column (not `balance`). Notification says "coin" not "gram".
- `POST /api/telegram/coins/spend` endpoint — verifies initData, deducts from DB coins column, returns new balance. Returns 400 if insufficient.
- Withdrawal min: 0.1 gram hardcoded floor (before admin settings check), messages say "gram".

## Frontend changes
- `TelegramUser` type has optional `coins?: number`.
- `CoinsContext` seeds from `user.coins` on first verified auth, uses per-user localStorage key (`gram_coins_balance_<tgId>`), spends optimistically + syncs to server in background.
- `WalletContext` exposes `addClickEarning(amount)` (alias for persistEarnings) — used by Miners.tsx.
- All "GMR" display text replaced with "gram" across Dashboard, Profile, Miners, Friends, Tasks, Admin pages and locales.
- Referral-related text says "coin" (Friends page, Admin ReferralSection).
- Admin LimitsSection default minWithdraw changed from '1' to '0.1'.
- Swap panel in Profile: direction state renamed `gram_to_ton` / `ton_to_gram`; labels gram ↔ TON.

**Why:** User requested: 1) rename GMR→gram, 2) coins = referral-only non-withdrawable currency, 3) min withdrawal 0.1 gram.
