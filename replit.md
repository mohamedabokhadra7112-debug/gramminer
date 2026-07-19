# GramMiner

A Telegram Mini App for a crypto mining game where users earn "gram" tokens by mining, completing tasks, and referring friends. Supports TON wallet integration and withdrawals.

## Run & Operate

- `PORT=8080 pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `PORT=5000 pnpm --filter @workspace/chatbot run dev` — run the frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `BOT_TOKEN` or `TELEGRAM_BOT_TOKEN` — Telegram bot token
- Optional env: `ADMIN_ID` — Telegram user ID of the admin

## Stack

- pnpm workspaces, Node.js 20, TypeScript
- Frontend: React 19 + Vite + Tailwind CSS v4 + shadcn/ui + wouter
- Backend: Express 5
- DB: PostgreSQL + Drizzle ORM
- TON: tonweb, @tonconnect/ui-react
- Build: esbuild (API), Vite (frontend)

## Where things live

- `artifacts/chatbot/` — React frontend (Telegram Mini App UI)
- `artifacts/api-server/` — Express API server
- `lib/db/` — Drizzle ORM schema and DB client
- `lib/api-client-react/` — Generated API hooks (Orval from OpenAPI spec)
- `lib/api-spec/` — OpenAPI spec + Orval config
- `lib/api-zod/` — Generated Zod schemas

## Architecture decisions

- API proxied through Vite dev server (`/api` → port 8080) so the frontend never hardcodes the API host
- TON Connect manifest served dynamically from API (`/api/tonconnect-manifest`) so the iconUrl uses the real origin
- All localStorage keys include the Telegram user ID to prevent cross-account data bleed
- DB schema changes use `ADD COLUMN IF NOT EXISTS` lazy migrations at route load time, not at startup
- Maintenance mode is checked per-request in middleware; admins (matching `ADMIN_ID`) bypass it

## Product

- **Mine**: Tap/claim gram tokens on a cooldown timer
- **Miners**: Purchase and manage mining hardware NFTs
- **Tasks**: Complete social/referral tasks to earn gram or coin
- **Friends**: Referral system — each referral earns coin rewards
- **Profile**: View stats, language selection, wallet connection
- **Admin**: Manage users, settings, maintenance mode, withdrawals

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- API server requires `PORT` env var — it throws on startup without it
- Vite dev server uses `PORT` env var (default 3000); set to 5000 for Replit webview
- Telegram WebApp scroll: use `--app-height` CSS var (set in App.tsx) instead of `100dvh`
- `@assets` alias resolves to `attached_assets/` on Replit, `src/assets/` elsewhere

## Pointers

- See `pnpm-workspace.yaml` for catalog versions and workspace package list
- DB schema: `lib/db/src/schema/index.ts`
- API routes: `artifacts/api-server/src/routes/`
- Frontend pages: `artifacts/chatbot/src/pages/`
