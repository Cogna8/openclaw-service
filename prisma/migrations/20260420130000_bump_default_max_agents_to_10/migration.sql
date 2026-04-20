-- Change default for accounts.max_agents from 3 to 10 on future rows
ALTER TABLE "accounts" ALTER COLUMN "max_agents" SET DEFAULT 10;

-- Backfill existing accounts that were created with the old default of 3
-- Only touch rows that are still at 3 - leave anything an admin has manually
-- adjusted (to any other value, higher or lower) alone.
UPDATE "accounts" SET "max_agents" = 10 WHERE "max_agents" = 3;
