/**
 * Policy template CRUD. Consumed by the portal-auth routes.
 *
 * Responsibilities:
 *   - list policies with per-account enablement state and concrete variant rules
 *   - enable a policy (write enablement + materialize rules across agents)
 *   - disable a policy (remove enablement + remove matching rules)
 *   - provision defaults for a new account (enable all templates flagged defaultEnabled)
 */

import { getDb } from "../lib/db.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import {
  CRITICAL_DEFAULT_TEMPLATE_IDS,
  POLICY_TEMPLATES,
  getTemplate,
  isValidTemplateId,
  type PolicyTemplate,
  type TemplateCategory,
  type TemplateRiskClass,
} from "../lib/policy-templates.js";
import {
  materializeTemplateForAccount,
  removeTemplateRulesForAccount,
} from "./policy-materializer.js";
import { createRuleAuditEvent } from "./rule-audit.js";
import { invalidateAgentRules } from "./rule-cache.js";

export type PolicyVariantRule = {
  public_id: string;
  agent_public_id: string;
  agent_name: string;
  tool_match: string;
  status: "active" | "disabled" | "removed";
};

export type PolicyListItem = {
  id: string;
  name: string;
  description: string;
  default_enabled: boolean;
  risk_class: TemplateRiskClass;
  category: TemplateCategory;
  enabled: boolean;
  enabled_at: string | null;
  variants: string[]; // all variants the template *defines*
  variants_detailed: { pattern: string; description: string }[];
  rules: PolicyVariantRule[]; // actual rules in DB for this account (grouped across agents)
};

export async function listPoliciesForAccount(
  accountId: string,
): Promise<PolicyListItem[]> {
  const db = getDb();

  const [enablements, allTemplateRules] = await Promise.all([
    db.accountPolicyEnablement.findMany({
      where: { accountId },
      select: { templateId: true, enabledAt: true },
    }),
    db.rule.findMany({
      where: {
        accountId,
        sourceTemplate: { not: null },
        removedAt: null,
      },
      select: {
        publicId: true,
        sourceTemplate: true,
        toolMatch: true,
        status: true,
        agent: { select: { publicId: true, name: true } },
      },
    }),
  ]);

  const enablementMap = new Map(
    enablements.map((e: any) => [e.templateId, e.enabledAt]),
  );

  return POLICY_TEMPLATES.map((template): PolicyListItem => {
    const enabledAt = enablementMap.get(template.id);
    const rulesForTemplate = allTemplateRules
      .filter((r: any) => r.sourceTemplate === template.id)
      .map((r: any): PolicyVariantRule => ({
        public_id: r.publicId,
        agent_public_id: r.agent.publicId,
        agent_name: r.agent.name,
        tool_match: r.toolMatch ?? "",
        status: r.status,
      }));

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      default_enabled: template.defaultEnabled,
      risk_class: template.riskClass,
      category: template.category,
      enabled: enabledAt !== undefined,
      enabled_at: enabledAt
        ? (enabledAt instanceof Date ? enabledAt.toISOString() : String(enabledAt))
        : null,
      variants: [...template.variants],
      variants_detailed: template.variantsDetailed,
      rules: rulesForTemplate,
    };
  });
}

export type EnablePolicyResult = {
  template_id: string;
  enabled: true;
  agents_touched: number;
  rules_created: number;
};

export async function enablePolicyForAccount(input: {
  accountId: string;
  templateId: string;
  actorUserId: string | null;
}): Promise<EnablePolicyResult> {
  if (!isValidTemplateId(input.templateId)) {
    throw new NotFoundError("Unknown policy template");
  }

  const template = getTemplate(input.templateId) as PolicyTemplate;
  const db = getDb();

  const result = await db.$transaction(
    async (tx: any) => {
      const existing = await tx.accountPolicyEnablement.findFirst({
        where: {
          accountId: input.accountId,
          templateId: input.templateId,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.accountPolicyEnablement.update({
          where: { id: existing.id },
          data: {
            enabledAt: new Date(),
            enabledByUserId: input.actorUserId,
          },
        });
      } else {
        try {
          await tx.accountPolicyEnablement.create({
            data: {
              accountId: input.accountId,
              templateId: input.templateId,
              enabledByUserId: input.actorUserId,
            },
          });
        } catch (err: any) {
          // Race-safe fallback: if a concurrent request created the row
          // after our findFirst, refresh it inside the same tx.
          if (err?.code === "P2002") {
            const concurrent = await tx.accountPolicyEnablement.findFirst({
              where: {
                accountId: input.accountId,
                templateId: input.templateId,
              },
              select: { id: true },
            });
            if (!concurrent) throw err;
            await tx.accountPolicyEnablement.update({
              where: { id: concurrent.id },
              data: {
                enabledAt: new Date(),
                enabledByUserId: input.actorUserId,
              },
            });
          } else {
            throw err;
          }
        }
      }

      return materializeTemplateForAccount(tx, {
        accountId: input.accountId,
        template,
        actorUserId: input.actorUserId,
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  return {
    template_id: input.templateId,
    enabled: true,
    agents_touched: result.agentsTouched,
    rules_created: result.rulesCreated,
  };
}

export type DisablePolicyResult = {
  template_id: string;
  enabled: false;
  rules_removed: number;
};

export async function disablePolicyForAccount(input: {
  accountId: string;
  templateId: string;
  actorUserId: string | null;
}): Promise<DisablePolicyResult> {
  if (!isValidTemplateId(input.templateId)) {
    throw new NotFoundError("Unknown policy template");
  }
  const db = getDb();

  const result = await db.$transaction(
    async (tx: any) => {
      const deleted = await tx.accountPolicyEnablement.deleteMany({
        where: {
          accountId: input.accountId,
          templateId: input.templateId,
        },
      });

      if (deleted.count === 0) {
        // Already disabled — still run remove in case stale rules exist
      }

      return removeTemplateRulesForAccount(tx, {
        accountId: input.accountId,
        templateId: input.templateId,
        actorUserId: input.actorUserId,
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  return {
    template_id: input.templateId,
    enabled: false,
    rules_removed: result.rulesRemoved,
  };
}

/**
 * Enable all defaultEnabled templates for a new account. Called on first sign-in
 * / account provisioning. Idempotent — safe to call on existing accounts, but
 * that would re-enable any templates the user has since disabled. DO NOT call
 * from outside the initial-provisioning path.
 */
export async function enableDefaultPoliciesForAccount(input: {
  accountId: string;
  actorUserId: string | null;
}): Promise<{ enabled_templates: string[] }> {
  const defaults = POLICY_TEMPLATES.filter((t) => t.defaultEnabled);
  const enabled: string[] = [];
  for (const template of defaults) {
    const result = await enablePolicyForAccount({
      accountId: input.accountId,
      templateId: template.id,
      actorUserId: input.actorUserId,
    });
    if (result.enabled) enabled.push(template.id);
  }
  return { enabled_templates: enabled };
}

export type ApplySecureDefaultsResult = {
  enabled_template_ids: string[];
  already_enabled_template_ids: string[];
  rules_created: number;
  agents_touched: number;
};

/**
 * Enable every template marked riskClass="critical" for an account. Idempotent
 * because enablePolicyForAccount + the materializer both treat re-runs as a
 * no-op: the enablement row is upserted and the rule materializer skips any
 * rule whose normalized fingerprint already exists.
 *
 * Distinct callers: this is the portal "Apply critical defaults" action.
 * enableDefaultPoliciesForAccount is for first-time account provisioning and
 * uses defaultEnabled (a different, slightly broader set).
 */
export async function applySecureDefaultsForAccount(input: {
  accountId: string;
  actorUserId: string | null;
}): Promise<ApplySecureDefaultsResult> {
  const db = getDb();

  const existing = await db.accountPolicyEnablement.findMany({
    where: {
      accountId: input.accountId,
      templateId: { in: [...CRITICAL_DEFAULT_TEMPLATE_IDS] },
    },
    select: { templateId: true },
  });
  const alreadyEnabled = new Set(
    existing.map((e: { templateId: string }) => e.templateId),
  );

  const enabledNow: string[] = [];
  const alreadyEnabledList: string[] = [];
  let totalRulesCreated = 0;

  for (const templateId of CRITICAL_DEFAULT_TEMPLATE_IDS) {
    const wasEnabledBefore = alreadyEnabled.has(templateId);
    const result = await enablePolicyForAccount({
      accountId: input.accountId,
      templateId,
      actorUserId: input.actorUserId,
    });

    totalRulesCreated += result.rules_created;
    if (wasEnabledBefore) {
      alreadyEnabledList.push(templateId);
    } else {
      enabledNow.push(templateId);
    }
  }

  // Count agents_touched as the union of active agents with at least one
  // critical-template rule. Summing per-template counts would double-count
  // agents that received variants from multiple critical templates.
  const agentsWithCriticalRules = await db.rule.findMany({
    where: {
      accountId: input.accountId,
      sourceTemplate: { in: [...CRITICAL_DEFAULT_TEMPLATE_IDS] },
      removedAt: null,
    },
    select: { agentId: true },
    distinct: ["agentId"],
  });

  return {
    enabled_template_ids: enabledNow,
    already_enabled_template_ids: alreadyEnabledList,
    rules_created: totalRulesCreated,
    agents_touched: agentsWithCriticalRules.length,
  };
}

/**
 * Delete a single template rule by public id. Used by the portal "delete one
 * variant" UI action. Only works on rules tagged with a source_template —
 * refuses to touch user-authored rules through this path.
 */
export async function deleteTemplateRule(input: {
  accountId: string;
  rulePublicId: string;
  actorUserId: string | null;
}): Promise<{ rule_id: string; removed: true }> {
  const db = getDb();

  const rule = await db.rule.findFirst({
    where: {
      accountId: input.accountId,
      publicId: input.rulePublicId,
      removedAt: null,
    },
    select: {
      id: true,
      publicId: true,
      agentId: true,
      type: true,
      status: true,
      spec: true,
      sourceTemplate: true,
      createdAt: true,
      agent: { select: { publicId: true } },
    },
  });

  if (!rule) throw new NotFoundError("Rule not found");
  if (!rule.sourceTemplate) {
    throw new ValidationError(
      "Only template-provisioned rules can be deleted via this endpoint",
    );
  }

  const now = new Date();
  await db.$transaction(async (tx: any) => {
    await tx.rule.update({
      where: { id: rule.id },
      data: { status: "removed", removedAt: now },
    });

    // Keep audit trail consistent with other rule removals
    await createRuleAuditEvent(tx, {
      accountId: input.accountId,
      agentId: rule.agentId,
      ruleId: rule.id,
      eventType: "removed",
      actorType: "console_user",
      actorUserId: input.actorUserId,
      snapshot: {
        id: rule.publicId,
        agent_id: rule.agent.publicId,
        type: rule.type,
        status: "removed",
        spec: rule.spec,
        source_template: rule.sourceTemplate,
        created_at: rule.createdAt instanceof Date
          ? rule.createdAt.toISOString()
          : String(rule.createdAt),
      },
    });

    const activeCount = await tx.rule.count({
      where: { agentId: rule.agentId, status: "active" },
    });
    await tx.agent.update({
      where: { id: rule.agentId },
      data: { activeRulesCount: activeCount },
    });

    invalidateAgentRules(rule.agentId);
  });

  return { rule_id: rule.publicId, removed: true };
}
