-- Policy Templates feature
-- Adds:
--   1. rules.source_template column (nullable text)
--   2. account_policy_enablements table
--   3. Bumps max_rules_per_agent default and backfills existing rows still at 25

-- ─── 1. rules.source_template ────────────────────────────────────────
ALTER TABLE "rules" ADD COLUMN "source_template" TEXT;

CREATE INDEX "idx_rules_account_source_template"
  ON "rules"("account_id", "source_template")
  WHERE "source_template" IS NOT NULL;

-- Restrict source_template to known template IDs. Kept as a CHECK so we can
-- add templates later with a narrow follow-up migration without needing an
-- enum ALTER.
ALTER TABLE "rules" ADD CONSTRAINT "chk_rules_source_template"
  CHECK (
    "source_template" IS NULL
    OR "source_template" IN (
      'block_shell_execution',
      'block_file_deletion',
      'block_file_writes',
      'block_outbound_http',
      'block_code_execution'
    )
  );

-- ─── 2. account_policy_enablements ───────────────────────────────────
CREATE TABLE "account_policy_enablements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "template_id" TEXT NOT NULL,
  "enabled_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "enabled_by_user_id" TEXT,

  CONSTRAINT "account_policy_enablements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_account_policy_enablements_account_template"
  ON "account_policy_enablements"("account_id", "template_id");

CREATE INDEX "idx_account_policy_enablements_account_id"
  ON "account_policy_enablements"("account_id");

ALTER TABLE "account_policy_enablements"
  ADD CONSTRAINT "fk_account_policy_enablements_account"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;

ALTER TABLE "account_policy_enablements" ADD CONSTRAINT "chk_ape_template_id"
  CHECK (
    "template_id" IN (
      'block_shell_execution',
      'block_file_deletion',
      'block_file_writes',
      'block_outbound_http',
      'block_code_execution'
    )
  );

-- ─── 3. Bump max_rules_per_agent default ─────────────────────────────
-- Default for new accounts goes from 25 to 100.
-- Backfill existing accounts still at 25 (leave any admin-adjusted value alone).
ALTER TABLE "accounts" ALTER COLUMN "max_rules_per_agent" SET DEFAULT 100;

UPDATE "accounts" SET "max_rules_per_agent" = 100 WHERE "max_rules_per_agent" = 25;
