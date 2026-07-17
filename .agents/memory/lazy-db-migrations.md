---
name: Lazy DB migrations pattern
description: How schema changes are applied in GramMiner without a migration runner
---

Since there's no Drizzle migrate step wired into the workflow, all new columns and tables are created lazily using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` inside a one-shot `ensureSchema()` function at the top of each route file.

**Why:** The DB may not be connected at startup (DATABASE_URL not set yet), so migrating at startup would crash the server. Lazy migration degrades gracefully.

**How to apply:** Add a module-level `let migrated = false` flag and an async `ensureSchema()` function. Call it at the top of every handler that needs the new columns. Use `pool.query()` directly (not Drizzle ORM) for the DDL statements.
