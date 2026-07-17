---
name: Withdrawal + TON sending
description: How the withdrawal system works end-to-end in GramMiner
---

**Flow:** User requests withdrawal → balance deducted immediately (held in escrow) → admin gets Telegram message → admin approves/rejects in Admin panel → on approve, tonweb sends TON on-chain; on reject, balance refunded + user notified.

**Required env vars:**
- `OWNER_SECRET_KEY` — JSON array of numbers (tonweb SecretKey, same format as config.json uploaded by user)
- `OWNER_PUBLIC_KEY` — JSON array of numbers (tonweb PublicKey)
- `ADMIN_ID` — Telegram user ID of the owner, receives withdrawal request notifications

**DB table:** `gm_withdrawals` with status: `pending | approved | rejected`

**Why:** User uploaded tonweb faucet files using this exact key format. Using `@ton/ton` would require mnemonic phrase instead; tonweb uses raw keypair which matches the user's existing config.json.

**How to apply:** Admin panel has a "طلبات السحب" section. Routes in `artifacts/api-server/src/routes/withdraw.ts`.
