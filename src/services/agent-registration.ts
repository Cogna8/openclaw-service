import { getDb } from "../lib/db.js";
import { generateAgentId } from "../lib/ids.js";
import { ValidationError } from "../lib/errors.js";
import { getOrCreateCurrentUsagePeriod } from "./usage-manager.js";
import { invalidateAgentRules } from "./rule-cache.js";
import { materializeEnabledPoliciesForAgent } from "./policy-materializer.js";

export type RegisterAgentInput = {
  accountId: string;
  body: {
    agent: {
      external_id: string;
      name: string;
      source?: string;
      plugin_version?: string;
      agent_version?: string;
    };
    tools: Array<{
      name: string;
      action_class?: string;
    }>;
    catalog_hash: string;
  };
};

export type RegisterAgentResult = {
  agent: {
    id: string;
    status: "created" | "synced";
  };
  tools_registered: number;
  active_rules: number;
};

export async function registerAgent(
  input: RegisterAgentInput,
): Promise<RegisterAgentResult> {
  const { accountId, body } = input;
  const { agent: agentInput, tools, catalog_hash } = body;
  const source = (agentInput.source ?? "openclaw") as "openclaw";
  const db = getDb();

  // Lookup existing agent
  const existing = await db.agent.findFirst({
    where: { accountId, source, externalId: agentInput.external_id },
  });

  if (existing) {
    return updateExistingAgent(db, accountId, existing, agentInput, tools, catalog_hash);
  } else {
    return createNewAgent(db, accountId, source, agentInput, tools, catalog_hash);
  }
}

async function createNewAgent(
  db: any,
  accountId: string,
  source: "openclaw",
  agentInput: RegisterAgentInput["body"]["agent"],
  tools: RegisterAgentInput["body"]["tools"],
  catalogHash: string,
): Promise<RegisterAgentResult> {
  const publicId = generateAgentId();

  const agent = await db.$transaction(async (tx: any) => {
    // Check active agent limit
    const activeCount = await tx.agent.count({
      where: { accountId, status: "active" },
    });
    const account = await tx.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { maxAgents: true },
    });
    if (activeCount >= account.maxAgents) {
      throw new ValidationError(
        `Maximum of ${account.maxAgents} active agents per account reached`,
      );
    }

    // Create agent
    const created = await tx.agent.create({
      data: {
        publicId,
        accountId,
        source,
        externalId: agentInput.external_id,
        name: agentInput.name,
        pluginVersion: agentInput.plugin_version ?? null,
        agentVersion: agentInput.agent_version ?? null,
        catalogHash,
        toolsRegisteredCount: tools.length,
        status: "active",
      },
    });

    // Create tool rows
    for (const tool of tools) {
      await tx.agentTool.create({
        data: {
          agentId: created.id,
          toolName: tool.name,
          actionClass: tool.action_class ?? null,
          isActive: true,
        },
      });
    }

    // Increment agentsRegistered on usage period
    const period = await getOrCreateCurrentUsagePeriod(tx, accountId);
    await tx.usagePeriod.update({
      where: { id: period.id },
      data: { agentsRegistered: { increment: 1 } },
    });

    // Materialize any account-level enabled policies as rules on the new agent.
    // Runs inside the same transaction so agent creation and rule provisioning
    // either both commit or both roll back.
    await materializeEnabledPoliciesForAgent(tx, {
      accountId,
      agentId: created.id,
      agentPublicId: created.publicId,
    });

    return created;
  });

  // Re-read agent to pick up activeRulesCount updated by materializer
  const finalAgent = await db.agent.findUniqueOrThrow({
    where: { id: agent.id },
    select: { publicId: true, activeRulesCount: true },
  });

  return {
    agent: { id: finalAgent.publicId, status: "created" },
    tools_registered: tools.length,
    active_rules: finalAgent.activeRulesCount,
  };
}

async function updateExistingAgent(
  db: any,
  accountId: string,
  existing: any,
  agentInput: RegisterAgentInput["body"]["agent"],
  tools: RegisterAgentInput["body"]["tools"],
  catalogHash: string,
): Promise<RegisterAgentResult> {
  const agent = await db.$transaction(async (tx: any) => {
    // Handle archived agent reactivation
    if (existing.status === "archived") {
      const activeCount = await tx.agent.count({
        where: { accountId, status: "active" },
      });
      const account = await tx.account.findUniqueOrThrow({
        where: { id: accountId },
        select: { maxAgents: true },
      });
      if (activeCount >= account.maxAgents) {
        throw new ValidationError(
          `Maximum of ${account.maxAgents} active agents per account reached`,
        );
      }
    }

    // Update mutable fields
    const updateData: any = {
      name: agentInput.name,
      pluginVersion: agentInput.plugin_version ?? null,
      agentVersion: agentInput.agent_version ?? null,
      lastSeenAt: new Date(),
    };

    if (existing.status === "archived") {
      updateData.status = "active";
    }

    // Check catalog drift
    const hashChanged = existing.catalogHash !== catalogHash;

    if (hashChanged) {
      // Mark all existing tools inactive
      await tx.agentTool.updateMany({
        where: { agentId: existing.id },
        data: { isActive: false },
      });

      // Sync each tool
      for (const tool of tools) {
        const existingTool = await tx.agentTool.findFirst({
          where: { agentId: existing.id, toolName: tool.name },
        });

        if (existingTool) {
          await tx.agentTool.update({
            where: { id: existingTool.id },
            data: {
              actionClass: tool.action_class ?? null,
              isActive: true,
              lastSeenAt: new Date(),
            },
          });
        } else {
          await tx.agentTool.create({
            data: {
              agentId: existing.id,
              toolName: tool.name,
              actionClass: tool.action_class ?? null,
              isActive: true,
            },
          });
        }
      }

      // Count active tools after sync
      const activeToolCount = await tx.agentTool.count({
        where: { agentId: existing.id, isActive: true },
      });

      updateData.catalogHash = catalogHash;
      updateData.toolsRegisteredCount = activeToolCount;
    }

    const updated = await tx.agent.update({
      where: { id: existing.id },
      data: updateData,
    });

    // Invalidate rule cache if catalog changed (action class mappings may have changed)
    if (hashChanged) {
      invalidateAgentRules(existing.id);
    }

    // If the agent was archived and is now reactivating, materialize any
    // account-level enabled policies onto it. The materializer is idempotent
    // (fingerprint-based), so if the agent already has the template rules
    // from a previous life they are left untouched.
    const wasReactivated = existing.status === "archived";
    if (wasReactivated) {
      await materializeEnabledPoliciesForAgent(tx, {
        accountId,
        agentId: existing.id,
        agentPublicId: existing.publicId,
      });
    }

    return updated;
  });

  // Re-read to pick up activeRulesCount updated by materializer on reactivation
  const finalAgent = await db.agent.findUniqueOrThrow({
    where: { id: agent.id },
    select: { publicId: true, toolsRegisteredCount: true, activeRulesCount: true },
  });

  return {
    agent: { id: finalAgent.publicId, status: "synced" },
    tools_registered: finalAgent.toolsRegisteredCount,
    active_rules: finalAgent.activeRulesCount,
  };
}
