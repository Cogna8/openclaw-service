-- Pack 1: Database Layer - Full init migration
-- Enums, tables, check constraints, partial indexes, unique indexes

-- ─── Enums ────────────────────────────────────────────────────────────

CREATE TYPE "plan_t" AS ENUM ('free', 'paid', 'enterprise');
CREATE TYPE "account_status_t" AS ENUM ('active', 'suspended', 'closed');
CREATE TYPE "api_key_status_t" AS ENUM ('active', 'revoked');
CREATE TYPE "agent_source_t" AS ENUM ('openclaw');
CREATE TYPE "agent_status_t" AS ENUM ('active', 'archived');
CREATE TYPE "action_class_t" AS ENUM (
  'file_read', 'file_write', 'file_delete', 'exec', 'browser',
  'message_send', 'email_read', 'email_send', 'email_archive', 'email_delete',
  'calendar_read', 'calendar_write', 'memory_write', 'memory_delete',
  'cron_create', 'cron_delete', 'session_spawn'
);
CREATE TYPE "rule_type_t" AS ENUM ('block', 'confirm', 'exclude', 'protect', 'threshold');
CREATE TYPE "rule_status_t" AS ENUM ('active', 'disabled', 'removed');
CREATE TYPE "rule_target_t" AS ENUM ('sender', 'path', 'resource_id');
CREATE TYPE "threshold_period_t" AS ENUM ('session');
CREATE TYPE "channel_type_t" AS ENUM ('direct', 'group', 'channel', 'unknown');
CREATE TYPE "decision_t" AS ENUM ('allow', 'block');
CREATE TYPE "eval_mode_t" AS ENUM ('normal', 'degraded');
CREATE TYPE "reason_code_t" AS ENUM (
  'protected_target', 'confirmation_required', 'threshold_exceeded',
  'excluded_target', 'blocked_tool'
);
CREATE TYPE "rule_event_type_t" AS ENUM ('created', 'enabled', 'disabled', 'removed');
CREATE TYPE "actor_type_t" AS ENUM ('api_key', 'console_user', 'system');

-- ─── Tables ───────────────────────────────────────────────────────────

-- 1. Account
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "plan" "plan_t" NOT NULL DEFAULT 'free',
    "status" "account_status_t" NOT NULL DEFAULT 'active',
    "evaluations_limit_monthly" INTEGER NOT NULL DEFAULT 10000,
    "max_agents" INTEGER NOT NULL DEFAULT 3,
    "max_rules_per_agent" INTEGER NOT NULL DEFAULT 25,
    "post_cap_new_rules_limit" INTEGER NOT NULL DEFAULT 3,
    "api_version" TEXT NOT NULL DEFAULT 'v1',
    "capability_flags" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_public_id_key" ON "accounts"("public_id");
CREATE INDEX "idx_accounts_owner_user_id" ON "accounts"("owner_user_id");
CREATE INDEX "idx_accounts_plan_status" ON "accounts"("plan", "status");

-- Account check constraints
ALTER TABLE "accounts" ADD CONSTRAINT "chk_accounts_public_id"
    CHECK ("public_id" ~ '^acct_[A-Za-z0-9]+$');
ALTER TABLE "accounts" ADD CONSTRAINT "chk_accounts_evaluations_limit"
    CHECK ("evaluations_limit_monthly" > 0);
ALTER TABLE "accounts" ADD CONSTRAINT "chk_accounts_max_agents"
    CHECK ("max_agents" > 0);
ALTER TABLE "accounts" ADD CONSTRAINT "chk_accounts_max_rules_per_agent"
    CHECK ("max_rules_per_agent" > 0);
ALTER TABLE "accounts" ADD CONSTRAINT "chk_accounts_post_cap_new_rules_limit"
    CHECK ("post_cap_new_rules_limit" >= 0);
ALTER TABLE "accounts" ADD CONSTRAINT "chk_accounts_capability_flags_object"
    CHECK (jsonb_typeof("capability_flags") = 'object');

-- 2. ApiKey
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "lookup_hash" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "secret_prefix" TEXT NOT NULL,
    "last_four" TEXT NOT NULL,
    "status" "api_key_status_t" NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_by_user_id" TEXT,
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_public_id_key" ON "api_keys"("public_id");
CREATE UNIQUE INDEX "api_keys_lookup_hash_key" ON "api_keys"("lookup_hash");
CREATE INDEX "idx_api_keys_account_id" ON "api_keys"("account_id");
CREATE INDEX "idx_api_keys_status" ON "api_keys"("status");

ALTER TABLE "api_keys" ADD CONSTRAINT "chk_api_keys_public_id"
    CHECK ("public_id" ~ '^key_[A-Za-z0-9]+$');
ALTER TABLE "api_keys" ADD CONSTRAINT "chk_api_keys_secret_prefix"
    CHECK ("secret_prefix" = 'cg8_sk_');
ALTER TABLE "api_keys" ADD CONSTRAINT "chk_api_keys_last_four_length"
    CHECK (length("last_four") = 4);

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Agent
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "source" "agent_source_t" NOT NULL DEFAULT 'openclaw',
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plugin_version" TEXT,
    "agent_version" TEXT,
    "api_version" TEXT NOT NULL DEFAULT 'v1',
    "capability_flags" JSONB NOT NULL DEFAULT '{}',
    "catalog_hash" TEXT NOT NULL,
    "tools_registered_count" INTEGER NOT NULL DEFAULT 0,
    "active_rules_count" INTEGER NOT NULL DEFAULT 0,
    "status" "agent_status_t" NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agents_public_id_key" ON "agents"("public_id");
CREATE UNIQUE INDEX "uq_agents_account_source_external" ON "agents"("account_id", "source", "external_id");
CREATE INDEX "idx_agents_account_id" ON "agents"("account_id");
CREATE INDEX "idx_agents_last_seen_at" ON "agents"("last_seen_at" DESC);

-- Partial index: active agents per account
CREATE INDEX "idx_agents_account_active" ON "agents"("account_id")
    WHERE "status" = 'active';

ALTER TABLE "agents" ADD CONSTRAINT "chk_agents_public_id"
    CHECK ("public_id" ~ '^agt_[A-Za-z0-9]+$');
ALTER TABLE "agents" ADD CONSTRAINT "chk_agents_external_id_length"
    CHECK (length("external_id") BETWEEN 1 AND 128);
ALTER TABLE "agents" ADD CONSTRAINT "chk_agents_name_length"
    CHECK (length("name") BETWEEN 1 AND 255);
ALTER TABLE "agents" ADD CONSTRAINT "chk_agents_capability_flags_object"
    CHECK (jsonb_typeof("capability_flags") = 'object');

ALTER TABLE "agents" ADD CONSTRAINT "agents_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. AgentTool
CREATE TABLE "agent_tools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "action_class" "action_class_t",
    "input_schema" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_tools_pkey" PRIMARY KEY ("id")
);

-- Case-insensitive unique constraint on (agentId, toolName)
CREATE UNIQUE INDEX "uq_agent_tools_agent_tool_name" ON "agent_tools"("agent_id", lower("tool_name"));
CREATE INDEX "idx_agent_tools_agent_action_class" ON "agent_tools"("agent_id", "action_class");
CREATE INDEX "idx_agent_tools_agent_is_active" ON "agent_tools"("agent_id", "is_active");

ALTER TABLE "agent_tools" ADD CONSTRAINT "chk_agent_tools_tool_name_length"
    CHECK (length("tool_name") BETWEEN 1 AND 128);
ALTER TABLE "agent_tools" ADD CONSTRAINT "chk_agent_tools_input_schema_object"
    CHECK ("input_schema" IS NULL OR jsonb_typeof("input_schema") = 'object');

ALTER TABLE "agent_tools" ADD CONSTRAINT "agent_tools_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Rule
CREATE TABLE "rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" "rule_type_t" NOT NULL,
    "status" "rule_status_t" NOT NULL DEFAULT 'active',
    "spec" JSONB NOT NULL,
    "normalized_fingerprint" TEXT NOT NULL,
    "tool_match" TEXT,
    "target_kind" "rule_target_t",
    "target_value" TEXT,
    "target_value_normalized" TEXT,
    "threshold_max" INTEGER,
    "threshold_period" "threshold_period_t",
    "created_via" "actor_type_t" NOT NULL DEFAULT 'api_key',
    "created_by_api_key_id" UUID,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,
    "disabled_at" TIMESTAMPTZ,
    "removed_at" TIMESTAMPTZ,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rules_public_id_key" ON "rules"("public_id");

-- Hot-path primary: active rules per agent
CREATE INDEX "idx_rules_agent_active" ON "rules"("agent_id")
    WHERE "status" = 'active';

CREATE INDEX "idx_rules_agent_type_status" ON "rules"("agent_id", "type", "status");

-- Hot-path: active rules by tool match
CREATE INDEX "idx_rules_agent_tool_active" ON "rules"("agent_id", "tool_match")
    WHERE "status" = 'active';

-- Hot-path: active rules by target
CREATE INDEX "idx_rules_agent_target_active" ON "rules"("agent_id", "target_kind", "target_value_normalized")
    WHERE "status" = 'active';

CREATE INDEX "idx_rules_account_id" ON "rules"("account_id");

-- Fingerprint dedup: only non-removed rules
CREATE UNIQUE INDEX "uq_rules_agent_fingerprint_live" ON "rules"("agent_id", "normalized_fingerprint")
    WHERE "removed_at" IS NULL;

ALTER TABLE "rules" ADD CONSTRAINT "chk_rules_public_id"
    CHECK ("public_id" ~ '^rl_[A-Za-z0-9]+$');
ALTER TABLE "rules" ADD CONSTRAINT "chk_rules_spec_object"
    CHECK (jsonb_typeof("spec") = 'object');
ALTER TABLE "rules" ADD CONSTRAINT "chk_rules_target_value_length"
    CHECK ("target_value" IS NULL OR length("target_value") <= 500);
ALTER TABLE "rules" ADD CONSTRAINT "chk_rules_threshold_max_range"
    CHECK ("threshold_max" IS NULL OR ("threshold_max" BETWEEN 1 AND 1000));

ALTER TABLE "rules" ADD CONSTRAINT "rules_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rules" ADD CONSTRAINT "rules_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_api_key_id_fkey"
    FOREIGN KEY ("created_by_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. RuleAuditEvent
CREATE TABLE "rule_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "event_type" "rule_event_type_t" NOT NULL,
    "actor_type" "actor_type_t" NOT NULL,
    "actor_api_key_id" UUID,
    "actor_user_id" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "rule_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_rule_audit_events_rule_created" ON "rule_audit_events"("rule_id", "created_at" DESC);
CREATE INDEX "idx_rule_audit_events_agent_created" ON "rule_audit_events"("agent_id", "created_at" DESC);
CREATE INDEX "idx_rule_audit_events_account_created" ON "rule_audit_events"("account_id", "created_at" DESC);

ALTER TABLE "rule_audit_events" ADD CONSTRAINT "chk_rule_audit_events_snapshot_object"
    CHECK (jsonb_typeof("snapshot") = 'object');

ALTER TABLE "rule_audit_events" ADD CONSTRAINT "rule_audit_events_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rule_audit_events" ADD CONSTRAINT "rule_audit_events_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rule_audit_events" ADD CONSTRAINT "rule_audit_events_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rule_audit_events" ADD CONSTRAINT "rule_audit_events_actor_api_key_id_fkey"
    FOREIGN KEY ("actor_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. UsagePeriod
CREATE TABLE "usage_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "evaluations_used" INTEGER NOT NULL DEFAULT 0,
    "blocks_stored" INTEGER NOT NULL DEFAULT 0,
    "allows_stored_sampled" INTEGER NOT NULL DEFAULT 0,
    "rules_created_total" INTEGER NOT NULL DEFAULT 0,
    "rules_created_after_cap" INTEGER NOT NULL DEFAULT 0,
    "agents_registered" INTEGER NOT NULL DEFAULT 0,
    "mode" "eval_mode_t" NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usage_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_usage_periods_account_period_start" ON "usage_periods"("account_id", "period_start");
CREATE INDEX "idx_usage_periods_account_mode" ON "usage_periods"("account_id", "mode");

ALTER TABLE "usage_periods" ADD CONSTRAINT "chk_usage_periods_period_end_gte_start"
    CHECK ("period_end" >= "period_start");
ALTER TABLE "usage_periods" ADD CONSTRAINT "chk_usage_periods_counters_non_negative"
    CHECK (
        "evaluations_used" >= 0
        AND "blocks_stored" >= 0
        AND "allows_stored_sampled" >= 0
        AND "rules_created_total" >= 0
        AND "rules_created_after_cap" >= 0
        AND "agents_registered" >= 0
    );

ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. EvaluationEvent
CREATE TABLE "evaluation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "api_key_id" UUID,
    "matched_rule_id" UUID,
    "usage_period_id" UUID NOT NULL,
    "decision" "decision_t" NOT NULL,
    "mode" "eval_mode_t" NOT NULL,
    "reason_code" "reason_code_t",
    "message" TEXT,
    "session_id" TEXT NOT NULL,
    "session_key" TEXT,
    "channel_provider" TEXT,
    "channel_type" "channel_type_t" NOT NULL DEFAULT 'unknown',
    "tool_name" TEXT NOT NULL,
    "action_class" "action_class_t",
    "targets" JSONB,
    "scope" JSONB,
    "raw_input" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "evaluation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_events_public_id_key" ON "evaluation_events"("public_id");
CREATE INDEX "idx_evaluation_events_agent_created" ON "evaluation_events"("agent_id", "created_at" DESC);
CREATE INDEX "idx_evaluation_events_account_created" ON "evaluation_events"("account_id", "created_at" DESC);
CREATE INDEX "idx_evaluation_events_matched_rule_created" ON "evaluation_events"("matched_rule_id", "created_at" DESC);
CREATE INDEX "idx_evaluation_events_usage_period" ON "evaluation_events"("usage_period_id");

-- Partial index: recent blocks feed
CREATE INDEX "idx_evaluation_events_agent_blocks" ON "evaluation_events"("agent_id", "created_at" DESC)
    WHERE "decision" = 'block';

ALTER TABLE "evaluation_events" ADD CONSTRAINT "chk_evaluation_events_public_id"
    CHECK ("public_id" ~ '^ev_[A-Za-z0-9]+$');
ALTER TABLE "evaluation_events" ADD CONSTRAINT "chk_evaluation_events_targets_object"
    CHECK ("targets" IS NULL OR jsonb_typeof("targets") = 'object');
ALTER TABLE "evaluation_events" ADD CONSTRAINT "chk_evaluation_events_scope_object"
    CHECK ("scope" IS NULL OR jsonb_typeof("scope") = 'object');
ALTER TABLE "evaluation_events" ADD CONSTRAINT "chk_evaluation_events_raw_input_object"
    CHECK ("raw_input" IS NULL OR jsonb_typeof("raw_input") = 'object');
ALTER TABLE "evaluation_events" ADD CONSTRAINT "chk_evaluation_events_session_id_length"
    CHECK (length("session_id") BETWEEN 1 AND 256);
ALTER TABLE "evaluation_events" ADD CONSTRAINT "chk_evaluation_events_session_key_length"
    CHECK ("session_key" IS NULL OR length("session_key") <= 512);

ALTER TABLE "evaluation_events" ADD CONSTRAINT "evaluation_events_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_events" ADD CONSTRAINT "evaluation_events_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_events" ADD CONSTRAINT "evaluation_events_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluation_events" ADD CONSTRAINT "evaluation_events_matched_rule_id_fkey"
    FOREIGN KEY ("matched_rule_id") REFERENCES "rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluation_events" ADD CONSTRAINT "evaluation_events_usage_period_id_fkey"
    FOREIGN KEY ("usage_period_id") REFERENCES "usage_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
