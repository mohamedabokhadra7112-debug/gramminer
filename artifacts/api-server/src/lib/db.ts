/**
 * Lazy DB accessor — imports @workspace/db on first call.
 * Returns null (and logs a warning) when DATABASE_URL is not set,
 * so routes that need the DB can degrade gracefully instead of crashing.
 */

import type { db as DbType } from "@workspace/db";
import { logger } from "./logger";

type Db = typeof DbType;

let _db: Db | null = null;
let _tried = false;

export async function getDb(): Promise<Db | null> {
  if (_tried) return _db;
  _tried = true;
  try {
    const mod = await import("@workspace/db");
    _db = mod.db;
  } catch (err) {
    logger.warn({ err }, "Database not available (DATABASE_URL probably not set)");
    _db = null;
  }
  return _db;
}
