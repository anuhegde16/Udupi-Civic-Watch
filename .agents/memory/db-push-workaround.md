---
name: DB schema push workaround
description: drizzle-kit push hangs waiting for user input on column rename prompts; workaround is psql direct SQL.
---

## Problem
`pnpm --filter @workspace/db run push` opens an interactive TTY prompt asking whether a new column is created or renamed from an existing one. The sandbox kills interactive commands.

## Workaround
Run migrations directly via psql:
```bash
psql "$DATABASE_URL" -c "ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type>;"
```

**Why:** drizzle-kit push is designed for interactive use; `--force` flag does not skip column-rename disambiguation prompts in the version used here.

**How to apply:** After editing Drizzle schema files, skip `pnpm run push` and write the DDL manually with `IF NOT EXISTS` guards. If the schema change is a rename, use the explicit rename SQL instead.
