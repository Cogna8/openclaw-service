/**
 * Policy materializer. Converts template enablement state into concrete rule
 * rows for a given agent or set of agents.
 *
 * Template rules bypass the per-agent rule cap and post-cap creation limit
 * because they are system-provisioned, not user-authored.
 *
 * Template rules use actorType='system' and the createdByUserId of the
 * portal user who enabled the policy (for audit traceability).
 */

import { generateRuleId } from "../lib/ids.js";
import { buildNormalizedFingerprint } from "../lib/rule-normalization.js";
import { getTemplate, type PolicyTemplate } from "../lib/policy-templates.js";
import { createRuleAuditEvent } from "./rule-audit.js";
import { invalidateAgentRules } from "./rule-cache.js";

type Tx = any;

/**
 * Shape of the snapshot we write into the audit trail. Mirrors the real rule
 * API response so downstream consumers see the same fields as user-created
 * rules.
 */
function buildSnapshot(rule: any, agentPublicId: string): Record<string, unknown> {
  return {
    id: rule.publicId,
    agent_id: agentPublicId,
    type: rule.type,
    status: rule.status,
    spec: rule.spec,
    source_template: rule.sourceTemplate,
    created_at: rule.createdAt instanceof Date
      ? rule.createdAt.toISOString()
      : String(rule.createdAt),
  };
}

/**
 * Create one block rule row for a template variant against a specific agent.
 * If an active rule with the same fingerprint already exists (user may have
 * authored a matching rule before enabling the policy), skip silently and
 * DO NOT tag the existing rule with source_template — leave user rules alone.
 */
async function createTemplateRule(
  tx: Tx,
  params: {
    accountId: string;
    agentId: string;
    agentPublicId: string;
    templateId: string;
    toolMatch: string;
    actorUserId: string | null;
  },
): Promise<{ created: boolean }> {
  const { accountId, agentId, agentPublicId, templateId, toolMatch, actorUserId } = params;

  const normalizedFingerprint = buildNormalizedFingerprint({
    type: "block",
    toolMatch,
  });

  // Idempotent: skip if a non-removed rule with this fingerprint already exists
  // on this agent. Covers both prior template materialization and user-authored
  // rules that happen to match.
  const existing = await tx.rule.findFirst({
    where: {
      agentId,
      normalizedFingerprint,
      removedAt: null,
    },
    select: { id: true },
  });
  if (existing) return { created: false };

  const publicId = generateRuleId();
  const spec = { tool: toolMatch };

  const rule = await tx.rule.create({
    data: {
      publicId,
      accountId,
      agentId,
      type: "block",
      status: "active",
      spec,
      normalizedFingerprint,
      toolMatch,
      createdVia: "system",
      createdByUserId: actorUserId ?? null,
      sourceTemplate: templateId,
    },
  });

  await createRuleAuditEvent(tx, {
    accountId,
    agentId,
    ruleId: rule.id,
    eventType: "created",
    actorType: "system",
    actorUserId: actorUserId ?? null,
    snapshot: buildSnapshot(rule, agentPublicId),
  });

  return { created: true };
}

/**
 * Materialize ALL enabled templates for a single agent. Called on agent
 * registration (new agent or archived reactivation) so the agent inherits
 * every currently-enabled account policy.
 */
export async function materializeEnabledPoliciesForAgent(
  tx: Tx,
  params: {
    accountId: string;
    agentId: string;
    agentPublicId: string;
  },
): Promise<{ rulesCreated: number }> {
  const enablements = await tx.accountPolicyEnablement.findMany({
    where: { accountId: params.accountId },
    select: { templateId: true, enabledByUserId: true },
  });

  let created = 0;
  for (const enablement of enablements) {
    const template = getTemplate(enablement.templateId);
    if (!template) continue; // template was removed from code — skip safely
    for (const variant of template.variants) {
      const result = await createTemplateRule(tx, {
        accountId: params.accountId,
        agentId: params.agentId,
        agentPublicId: params.agentPublicId,
        templateId: template.id,
        toolMatch: variant,
        actorUserId: enablement.enabledByUserId ?? null,
      });
      if (result.created) created += 1;
    }
  }

  if (created > 0) {
    // Recount active rules for this agent so agents.active_rules_count stays
    // consistent with the new rows.
    const activeCount = await tx.rule.count({
      where: { agentId: params.agentId, status: "active" },
    });
    await tx.agent.update({
      where: { id: params.agentId },
      data: { activeRulesCount: activeCount },
    });
    invalidateAgentRules(params.agentId);
  }

  return { rulesCreated: created };
}

/**
 * Materialize ONE template across ALL active agents for an account. Called
 * when a user enables a policy in the portal.
 */
export async function materializeTemplateForAccount(
  tx: Tx,
  params: {
    accountId: string;
    template: PolicyTemplate;
    actorUserId: string | null;
  },
): Promise<{ agentsTouched: number; rulesCreated: number }> {
  const agents = await tx.agent.findMany({
    where: { accountId: params.accountId, status: "active" },
    select: { id: true, publicId: true },
  });

  let totalCreated = 0;
  let agentsTouched = 0;

  for (const agent of agents) {
    let createdForAgent = 0;
    for (const variant of params.template.variants) {
      const result = await createTemplateRule(tx, {
        accountId: params.accountId,
        agentId: agent.id,
        agentPublicId: agent.publicId,
        templateId: params.template.id,
        toolMatch: variant,
        actorUserId: params.actorUserId,
      });
      if (result.created) createdForAgent += 1;
    }
    if (createdForAgent > 0) {
      const activeCount = await tx.rule.count({
        where: { agentId: agent.id, status: "active" },
      });
      await tx.agent.update({
        where: { id: agent.id },
        data: { activeRulesCount: activeCount },
      });
      invalidateAgentRules(agent.id);
      agentsTouched += 1;
      totalCreated += createdForAgent;
    }
  }

  return { agentsTouched, rulesCreated: totalCreated };
}

/**
 * Remove all template rules for a given template across the account. Called
 * when a user disables a policy. Hard-deletes (sets removedAt + status=removed)
 * so "Reset to defaults" re-creates fresh rules on re-enable.
 *
 * Does NOT touch rules tagged with a different source_template, and does NOT
 * touch user-authored rules (source_template IS NULL).
 */
export async function removeTemplateRulesForAccount(
  tx: Tx,
  params: {
    accountId: string;
    templateId: string;
    actorUserId: string | null;
  },
): Promise<{ rulesRemoved: number }> {
  const matching = await tx.rule.findMany({
    where: {
      accountId: params.accountId,
      sourceTemplate: params.templateId,
      removedAt: null,
    },
    select: { id: true, publicId: true, agentId: true, type: true, status: true, spec: true, sourceTemplate: true, createdAt: true },
  });

  if (matching.length === 0) return { rulesRemoved: 0 };

  const now = new Date();
  const touchedAgents = new Set<string>();

  for (const rule of matching) {
    await tx.rule.update({
      where: { id: rule.id },
      data: { status: "removed", removedAt: now },
    });
    touchedAgents.add(rule.agentId);

    // Find agent publicId for snapshot
    const agent = await tx.agent.findUniqueOrThrow({
      where: { id: rule.agentId },
      select: { publicId: true },
    });

    await createRuleAuditEvent(tx, {
      accountId: params.accountId,
      agentId: rule.agentId,
      ruleId: rule.id,
      eventType: "removed",
      actorType: "system",
      actorUserId: params.actorUserId,
      snapshot: buildSnapshot(
        {
          publicId: rule.publicId,
          type: rule.type,
          status: "removed",
          spec: rule.spec,
          sourceTemplate: rule.sourceTemplate,
          createdAt: rule.createdAt,
        },
        agent.publicId,
      ),
    });
  }

  for (const agentId of touchedAgents) {
    const activeCount = await tx.rule.count({
      where: { agentId, status: "active" },
    });
    await tx.agent.update({
      where: { id: agentId },
      data: { activeRulesCount: activeCount },
    });
    invalidateAgentRules(agentId);
  }

  return { rulesRemoved: matching.length };
}
