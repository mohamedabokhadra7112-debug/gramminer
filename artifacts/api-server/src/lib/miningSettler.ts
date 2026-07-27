/**
 * Background mining settler — DISABLED.
 *
 * Coin-based mining is now CONTINUOUS and time-based, computed server-side on
 * demand from `coins` and `last_mining_at` (see routes/telegram.ts:
 * GET /telegram/mining/accrued and POST /telegram/claim). Earnings accrue since
 * the last claim, capped at 24 hours, and STOP until the user claims — claiming
 * restarts the cycle.
 *
 * This settler must NOT auto-credit anymore: doing so would (a) let earnings
 * exceed the 24h cap by continuously advancing last_mining_at, and (b)
 * double-credit against the on-demand claim/accrual path. The interval loop has
 * therefore been removed. The file and its exports are kept so index.ts (which
 * calls startMiningSettler at boot) continues to work unchanged.
 */

import { logger } from "./logger";

/**
 * No-op. Retained for backwards compatibility with index.ts startup wiring.
 * Continuous accrual is handled entirely by the on-demand routes now.
 */
export function startMiningSettler() {
  logger.info(
    "Mining settler is disabled: coin-based mining now accrues continuously " +
      "(server-computed, capped at 24h, reset on claim) via /telegram/mining/accrued " +
      "and /telegram/claim. No background crediting runs.",
  );
}
