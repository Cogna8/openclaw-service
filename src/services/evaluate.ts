import { getDb } from "../lib/db.js";
import { resolveAgentForAccount } from "./agent-resolver.js";
import { resolveActionClass } from "./action-class-resolver.js";
import { loadActiveRulesForAgent } from "./rule-loader.js";
import { matchRules, type NormalizedToolCall } from "./rule-matcher.js";
import {
  getOrCreateCurrentUsagePeriod,
  getAccountEvaluationLimit,
} from "./usage-manager.js";
import { shouldStoreAllowSample, storeEvaluationEvent } from "./event-store.js";
import { normalizePath } from "../lib/rule-normalization.js";

export type EvaluateInput = {
  accountId: string;
  apiKeyId: string;
  body: {
    agent_id: string;
    session: { id: string; key?: string };
    channel?: { provider?: string; type?: string };
    tool_call: {
      tool_name: string;
      action_class?: string;
      targets?: Record<string, unknown>;
      scope?: Record<string, unknown>;
      raw_input?: Record<string, unknown>;
    };
  };
};

export type EvaluateResult = {
  decision: "allow" | "block";
  mode: "normal" | "degraded";
  rule: null | { id: string; type: string };
  reason_code: null | string;
  message: null | string;
  evaluation: {
    id: string | null;
    stored: boolean;
  };
};

function extractNormalizedToolCall(
  toolCall: EvaluateInput["body"]["tool_call"],
  actionClass: string | null,
): NormalizedToolCall {
  const targets = toolCall.targets ?? {};
  const scope = toolCall.scope ?? {};

  let sender: string | null = null;
  if (typeof targets.sender === "string" && targets.sender) {
    sender = targets.sender.toLowerCase();
  }

  let path: string | null = null;
  if (typeof targets.path === "string" && targets.path) {
    path = normalizePath(targets.path).toLowerCase();
  }

  let resourceId: string | null = null;
  if (typeof targets.resource_id === "string" && targets.resource_id) {
    resourceId = targets.resource_id.toLowerCase();
  }

  let countInSession: number | null = null;
  if (typeof scope.count_in_session === "number") {
    countInSession = scope.count_in_session;
  }

  return {
    toolName: toolCall.tool_name.toLowerCase(),
    actionClass,
    sender,
    path,
    resourceId,
    countInSession,
  };
}

export async function evaluateHotPath(input: EvaluateInput): Promise<EvaluateResult> {
  const { accountId, apiKeyId, body } = input;

  // 1. Resolve agent
  const agent = await resolveAgentForAccount(accountId, body.agent_id);

  // 2. Resolve action class
  const actionClass = await resolveActionClass(
    agent.id,
    body.tool_call.tool_name,
    body.tool_call.action_class,
  );

  // 3. Load active rules
  const rules = await loadActiveRulesForAgent(agent.id);

  // 4. Extract and normalize tool call
  const normalizedCall = extractNormalizedToolCall(body.tool_call, actionClass);

  // 5. Match rules
  const match = matchRules(rules, normalizedCall);

  // 6. Determine decision
  const decision: "allow" | "block" = match ? "block" : "allow";

  // 7-8. Transaction: usage update + conditional event storage
  const db = getDb();
  const result = await db.$transaction(async (tx: any) => {
    // a. Get/create usage period
    const period = await getOrCreateCurrentUsagePeriod(tx, accountId);

    // b. Read account evaluation limit
    const limit = await getAccountEvaluationLimit(tx, accountId);

    // c. Compute mode after increment
    const newCount = period.evaluationsUsed + 1;
    const mode: "normal" | "degraded" = newCount >= limit ? "degraded" : "normal";

    // Determine whether to store event
    let willStore = false;
    let isAllowSampled = false;

    if (decision === "block") {
      willStore = true;
    } else if (mode !== "degraded") {
      isAllowSampled = shouldStoreAllowSample(
        period.id,
        body.session.id,
        body.tool_call.tool_name,
      );
      willStore = isAllowSampled;
    }

    // Single usage period update with all increments
    const updateData: Record<string, unknown> = {
      evaluationsUsed: { increment: 1 },
      mode,
    };
    if (willStore && decision === "block") {
      updateData.blocksStored = { increment: 1 };
    }
    if (isAllowSampled) {
      updateData.allowsStoredSampled = { increment: 1 };
    }
    await tx.usagePeriod.update({
      where: { id: period.id },
      data: updateData,
    });

    // d. Conditionally store evaluation event
    let evaluationPublicId: string | null = null;
    if (willStore) {
      const stored = await storeEvaluationEvent(tx, {
        accountId,
        agentId: agent.id,
        apiKeyId,
        usagePeriodId: period.id,
        matchedRuleId: match?.ruleId ?? null,
        decision,
        mode,
        reasonCode: match?.reasonCode ?? null,
        message: match?.message ?? null,
        sessionId: body.session.id,
        sessionKey: body.session.key ?? null,
        channelProvider: body.channel?.provider ?? null,
        channelType: body.channel?.type ?? null,
        toolName: body.tool_call.tool_name,
        actionClass,
        targets: body.tool_call.targets ?? null,
        scope: body.tool_call.scope ?? null,
        rawInput: body.tool_call.raw_input ?? null,
      });
      evaluationPublicId = stored.publicId;
    }

    return { mode, evaluationPublicId, stored: willStore };
  });

  // 9. Construct response
  return {
    decision,
    mode: result.mode,
    rule: match
      ? { id: match.rulePublicId, type: match.ruleType }
      : null,
    reason_code: match?.reasonCode ?? null,
    message: match?.message ?? null,
    evaluation: {
      id: result.evaluationPublicId,
      stored: result.stored,
    },
  };
}
