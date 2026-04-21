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
  POLICY_TEMPLATES,
  getTemplate,
  isValidTemplateId,
  type PolicyTemplate,
} from "../lib/policy-templates.js";
import {
  materializeTemplateForAccount,
  removeTemplateRulesForAccount,
} from "./policy-materializer.js";

export type PolicyVariantRule = {
  public_id: string;
  agent_public_id: string;
  tool_match: string;
  status: "active" | "disabled" | "removed";
};

export type PolicyListItem = {
  id: string;
  name: string;
  description: string;
  default_enabled: boolean;
  enabled: boolean;
  enabled_at: string | null;
  variants: string[]; // all variants the template *defines*
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
        agent: { select: { publicId: true } },
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
        tool_match: r.toolMatch ?? "",
        status: r.status,
      }));

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      default_enabled: template.defaultEnabled,
      enabled: enabledAt !== undefined,
      enabled_at: enabledAt
        ? (enabledAt instanceof Date ? enabledAt.toISOString() : String(enabledAt))
        : null,
      variants: [...template.variants],
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

  const result = await db.$transaction(async (tx: any) => {
    // Upsert enablement
    await tx.accountPolicyEnablement.upsert({
      where: {
        accountId_templateId: {
          accountId: input.accountId,
          templateId: input.templateId,
        },
      },
      create: {
        accountId: input.accountId,
        templateId: input.templateId,
        enabledByUserId: input.actorUserId,
      },
      update: {
        // Refresh enabledAt and actor on re-enable
        enabledAt: new Date(),
        enabledByUserId: input.actorUserId,
      },
    });

    const materializeResult = await materializeTemplateForAccount(tx, {
      accountId: input.accountId,
      template,
      actorUserId: input.actorUserId,
    });

    return materializeResult;
  });

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

  const result = await db.$transaction(async (tx: any) => {
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
  });

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
    const { createRuleAuditEvent } = await import("./rule-audit.js");
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

    const { invalidateAgentRules } = await import("./rule-cache.js");
    invalidateAgentRules(rule.agentId);
  });

  return { rule_id: rule.publicId, removed: true };
}
