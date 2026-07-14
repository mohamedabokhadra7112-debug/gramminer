# GramMiner

GramMiner is a Telegram Mini App "tap to mine" game — users tap a coin to earn GMR tokens, upgrade miners, complete tasks, and invite friends for referral rewards.

## Run & Operate

- `pnpm --filter @workspace/chatbot run dev` — run the web frontend (Telegram Mini App)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000 in prod, serves `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env (for the Telegram bot webhook to work): `TELEGRAM_BOT_TOKEN`, `APP_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (`artifacts/chatbot`), wouter routing, Tailwind v4, shadcn/ui, framer-motion
- API: Express 5 (`artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM (not yet used by the app — wallet state is currently client-side only)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/chatbot` — the GramMiner Telegram Mini App frontend (Dashboard/mine, Miners, Tasks, Friends, Profile pages)
- `artifacts/api-server/src/routes/telegram.ts` — Telegram bot webhook + setup endpoints (ported from Vercel serverless functions)
- `.migration-backup/` — original imported Vercel project, kept for reference only (not run)

## Architecture decisions

- Ported from a Vercel-deployed project that was already structured as a pnpm workspace with Replit artifact conventions (not a raw Next.js app), so the frontend was copied over largely as-is rather than converted from Next.js.
- Telegram bot serverless functions (`api/setup.js`, `api/webhook.js`) were converted to Express routes under `/api/telegram/*` in `artifacts/api-server`.
- Wallet/mining state (`WalletContext`) is currently in-memory client state only — no persistence across reloads yet.

## Product

- Tap-to-mine coin game with a live session earnings counter
- Holding wallet / pool wallet balances, wallet connect flow (UI only)
- Miners, Tasks, Friends (referrals), and Profile tabs
- Telegram bot (`/start`, `/balance`, admin `/admin`, `/stats`, `/broadcast`) that opens the Mini App

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Telegram bot webhook endpoints require `TELEGRAM_BOT_TOKEN` and `APP_URL` secrets to actually register/respond; without them `/api/telegram/setup` returns 400 and the app UI still works fine (bot features are separate from the Mini App UI).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
