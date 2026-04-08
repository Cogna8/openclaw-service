import { getDb } from "../lib/db.js";
import { generateRuleId } from "../lib/ids.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import {
  buildNormalizedFingerprint,
  type RuleFingerprintInput,
} from "../lib/rule-normalization.js";
import {
  activateRule,
  disableRule as disableRuleStatus,
  removeRule as removeRuleStatus,
} from "../lib/rule-status.js";
import { resolveAgentForAccount } from "./agent-resolver.js";
import { validateAndNormalizeRuleSpec } from "./rule-spec-validator.js";
import { createRuleAuditEvent } from "./rule-audit.js";
import { invalidateAgentRules } from "./rule-cache.js";
import { getOrCreateCurrentUsagePeriod } from "./usage-manager.js";

export type RuleResponse = {
  id: string;
  agent_id: string;
  type: string;
  status: string;
  spec: Record<string, unknown>;
  created_at: string;
};

export type CreateRuleInput = {
  accountId: string;
  apiKeyId: string;
  agentPublicId: string;
  type: "block" | "confirm" | "exclude" | "protect" | "threshold";
  spec: Record<string, unknown>;
};

export type ListRulesInput = {
  accountId: string;
  agentPublicId: string;
  status: "active" | "disabled" | "all";
};

function toRuleResponse(rule: any, agentPublicId: string): RuleResponse {
  return {
    id: rule.publicId,
    agent_id: agentPublicId,
    type: rule.type,
    status: rule.status,
    spec: rule.spec as Record<string, unknown>,
    created_at: rule.createdAt instanceof Date
      ? rule.createdAt.toISOString()
      : String(rule.createdAt),
  };
}

function buildSnapshot(rule: any, agentPublicId: string): Record<string, unknown> {
  return {
    id: rule.publicId,
    agent_id: agentPublicId,
    type: rule.type,
    status: rule.status,
    spec: rule.spec,
    created_at: rule.createdAt instanceof Date
      ? rule.createdAt.toISOString()
      : String(rule.createdAt),
  };
}

export async function createRule(input: CreateRuleInput): Promise<RuleResponse> {
  const { accountId, apiKeyId, type, spec } = input;

  // 1. Resolve agent
  const agent = await resolveAgentForAccount(accountId, input.agentPublicId);

  // 2. Validate and normalize spec
  const validated = validateAndNormalizeRuleSpec(type, spec);

  // 3. Build fingerprint
  const fingerprintInput: RuleFingerprintInput = {
    type,
    toolMatch: validated.normalized.toolMatch ?? undefined,
    targetKind: validated.normalized.targetKind ?? undefined,
    targetValue: validated.normalized.targetValue ?? undefined,
    thresholdMax: validated.normalized.thresholdMax ?? undefined,
    thresholdPeriod: validated.normalized.thresholdPeriod ?? undefined,
  };
  const normalizedFingerprint = buildNormalizedFingerprint(fingerprintInput);

  const db = getDb();

  // 4. Load account limits
  const account = await db.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { maxRulesPerAgent: true, postCapNewRulesLimit: true },
  });

  // 5. Count active + disabled rules for the agent
  const ruleCount = await db.rule.count({
    where: {
      agentId: agent.id,
      status: { in: ["active", "disabled"] },
    },
  });

  // 6. Reject if count >= maxRulesPerAgent
  if (ruleCount >= account.maxRulesPerAgent) {
    throw new ValidationError(
      `Agent has reached the maximum of ${account.maxRulesPerAgent} rules`,
      "agent_id",
    );
  }

  // 7. Check duplicate by pre-check
  const existingRule = await db.rule.findFirst({
    where: {
      agentId: agent.id,
      normalizedFingerprint,
      removedAt: null,
    },
  });
  if (existingRule) {
    throw new ConflictError(
      "A rule with the same specification already exists for this agent",
    );
  }

  // 8. Generate public ID
  const publicId = generateRuleId();

  // 9. Transaction: create rule + usage + audit + agent count
  const rule = await db.$transaction(async (tx: any) => {
    // Check degraded mode and post-cap limit
    const period = await getOrCreateCurrentUsagePeriod(tx, accountId);
    const usagePeriod = await tx.usagePeriod.findFirst({
      where: { id: period.id },
      select: { mode: true, rulesCreatedAfterCap: true },
    });

    const isDegraded = usagePeriod?.mode === "degraded";
    if (isDegraded) {
      if ((usagePeriod?.rulesCreatedAfterCap ?? 0) >= account.postCapNewRulesLimit) {
        throw new ValidationError(
          "Post-cap rule creation limit reached",
          "type",
        );
      }
    }

    let created: any;
    try {
      created = await tx.rule.create({
        data: {
          publicId,
          accountId,
          agentId: agent.id,
          type,
          status: "active",
          spec: validated.normalizedSpec,
          normalizedFingerprint,
          toolMatch: validated.normalized.toolMatch,
          targetKind: validated.normalized.targetKind ?? undefined,
          targetValue: validated.normalized.targetValue,
          targetValueNormalized: validated.normalized.targetValueNormalized,
          thresholdMax: validated.normalized.thresholdMax,
          thresholdPeriod: validated.normalized.thresholdPeriod ?? undefined,
          createdVia: "api_key",
          createdByApiKeyId: apiKeyId,
        },
      });
    } catch (err: any) {
      // DB unique constraint conflict
      if (err?.code === "P2002") {
        throw new ConflictError(
          "A rule with the same specification already exists for this agent",
        );
      }
      throw err;
    }

    // Usage period increment
    const usageIncrement: Record<string, { increment: number }> = {
      rulesCreatedTotal: { increment: 1 },
    };
    if (isDegraded) {
      usageIncrement.rulesCreatedAfterCap = { increment: 1 };
    }
    await tx.usagePeriod.update({
      where: { id: period.id },
      data: usageIncrement,
    });

    // Audit event
    await createRuleAuditEvent(tx, {
      accountId,
      agentId: agent.id,
      ruleId: created.id,
      eventType: "created",
      actorType: "api_key",
      actorApiKeyId: apiKeyId,
      snapshot: buildSnapshot(created, agent.publicId),
    });

    // Increment agent activeRulesCount
    await tx.agent.update({
      where: { id: agent.id },
      data: { activeRulesCount: { increment: 1 } },
    });

    return created;
  });

  // Invalidate cache after commit
  invalidateAgentRules(agent.id);

  return toRuleResponse(rule, agent.publicId);
}

export async function listRules(
  input: ListRulesInput,
): Promise<{ rules: RuleResponse[]; count: number }> {
  const agent = await resolveAgentForAccount(input.accountId, input.agentPublicId);

  const db = getDb();
  const statusFilter =
    input.status === "all"
      ? { in: ["active", "disabled"] as ("active" | "disabled")[] }
      : input.status;

  const rules = await db.rule.findMany({
    where: { agentId: agent.id, status: statusFilter },
    orderBy: { createdAt: "desc" },
  });

  return {
    rules: rules.map((r: any) => toRuleResponse(r, agent.publicId)),
    count: rules.length,
  };
}

async function findRuleForAccount(
  accountId: string,
  rulePublicId: string,
  rejectRemoved = true,
) {
  const db = getDb();
  const rule = await db.rule.findFirst({
    where: { publicId: rulePublicId },
    include: { agent: { select: { publicId: true } } },
  });

  if (!rule || rule.accountId !== accountId) {
    throw new NotFoundError("Rule not found");
  }
  if (rejectRemoved && rule.status === "removed") {
    throw new NotFoundError("Rule not found");
  }

  return rule;
}

export async function enableRule(
  accountId: string,
  rulePublicId: string,
  apiKeyId: string,
): Promise<RuleResponse> {
  const rule = await findRuleForAccount(accountId, rulePublicId);

  if (rule.status === "active") {
    throw new ConflictError("Rule is already active");
  }

  const statusUpdate = activateRule(rule as any);
  const db = getDb();

  const updated = await db.$transaction(async (tx: any) => {
    const result = await tx.rule.update({
      where: { id: rule.id },
      data: statusUpdate,
    });

    await createRuleAuditEvent(tx, {
      accountId,
      agentId: rule.agentId,
      ruleId: rule.id,
      eventType: "enabled",
      actorType: "api_key",
      actorApiKeyId: apiKeyId,
      snapshot: buildSnapshot(result, rule.agent.publicId),
    });

    await tx.agent.update({
      where: { id: rule.agentId },
      data: { activeRulesCount: { increment: 1 } },
    });

    return result;
  });

  invalidateAgentRules(rule.agentId);
  return toRuleResponse(updated, rule.agent.publicId);
}

export async function disableRule(
  accountId: string,
  rulePublicId: string,
  apiKeyId: string,
): Promise<RuleResponse> {
  const rule = await findRuleForAccount(accountId, rulePublicId);

  if (rule.status === "disabled") {
    throw new ConflictError("Rule is already disabled");
  }

  const statusUpdate = disableRuleStatus(rule as any);
  const db = getDb();

  const updated = await db.$transaction(async (tx: any) => {
    const result = await tx.rule.update({
      where: { id: rule.id },
      data: statusUpdate,
    });

    await createRuleAuditEvent(tx, {
      accountId,
      agentId: rule.agentId,
      ruleId: rule.id,
      eventType: "disabled",
      actorType: "api_key",
      actorApiKeyId: apiKeyId,
      snapshot: buildSnapshot(result, rule.agent.publicId),
    });

    // Guard: don't decrement below zero
    const agent = await tx.agent.findUniqueOrThrow({
      where: { id: rule.agentId },
      select: { activeRulesCount: true },
    });
    if (agent.activeRulesCount > 0) {
      await tx.agent.update({
        where: { id: rule.agentId },
        data: { activeRulesCount: { decrement: 1 } },
      });
    }

    return result;
  });

  invalidateAgentRules(rule.agentId);
  return toRuleResponse(updated, rule.agent.publicId);
}

export async function removeRule(
  accountId: string,
  rulePublicId: string,
  apiKeyId: string,
): Promise<{ id: string; removed: true }> {
  const rule = await findRuleForAccount(accountId, rulePublicId, false);

  if (rule.status === "removed") {
    throw new NotFoundError("Rule not found");
  }

  const wasActive = rule.status === "active";
  const statusUpdate = removeRuleStatus(rule as any);
  const db = getDb();

  await db.$transaction(async (tx: any) => {
    const result = await tx.rule.update({
      where: { id: rule.id },
      data: statusUpdate,
    });

    await createRuleAuditEvent(tx, {
      accountId,
      agentId: rule.agentId,
      ruleId: rule.id,
      eventType: "removed",
      actorType: "api_key",
      actorApiKeyId: apiKeyId,
      snapshot: buildSnapshot(result, rule.agent.publicId),
    });

    // Only decrement if previously active, guard against below zero
    if (wasActive) {
      const agent = await tx.agent.findUniqueOrThrow({
        where: { id: rule.agentId },
        select: { activeRulesCount: true },
      });
      if (agent.activeRulesCount > 0) {
        await tx.agent.update({
          where: { id: rule.agentId },
          data: { activeRulesCount: { decrement: 1 } },
        });
      }
    }
  });

  invalidateAgentRules(rule.agentId);
  return { id: rulePublicId, removed: true };
}
