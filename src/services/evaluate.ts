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
import { buildConfirmPrompt, type ConfirmPromptPayload } from "./confirm-prompt.js";
import { semverLtOrInvalid } from "../lib/semver-compare.js";
import { isBenchAccount } from "../lib/account-flags.js";

export type EvaluateInput = {
  accountId: string;
  apiKeyId: string;
  capabilityFlags?: unknown;
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
  decision: "allow" | "block" | "confirm";
  mode: "normal" | "degraded";
  rule: null | { id: string; type: string };
  reason_code: null | string;
  message: null | string;
  evaluation: {
    id: string | null;
    stored: boolean;
  };
  decision_id?: string;
  prompt?: ConfirmPromptPayload;
  timeout_ms?: number;
  timeout_behavior?: "deny";
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
  const benchAccount = isBenchAccount(input.capabilityFlags);

  const agent = await resolveAgentForAccount(accountId, body.agent_id);

  const actionClass = await resolveActionClass(
    agent.id,
    body.tool_call.tool_name,
    body.tool_call.action_class,
  );

  const rules = await loadActiveRulesForAgent(agent.id);
  const normalizedCall = extractNormalizedToolCall(body.tool_call, actionClass);
  const match = matchRules(rules, normalizedCall);

  let decision: "allow" | "block" | "confirm";
  let promptPayload: ConfirmPromptPayload | null = null;
  let responseReasonCode: string | null = null;
  let responseMessage: string | null = null;
  let storedReasonCode: string | null = null;
  let storedMessage: string | null = null;

  if (!match) {
    decision = "allow";
  } else if (match.ruleType === "confirm") {
    const pluginVersion = agent.pluginVersion;

    if (!pluginVersion || semverLtOrInvalid(pluginVersion, "0.3.0")) {
      decision = "block";
      responseReasonCode = "plugin_version_too_old_for_confirm";
      responseMessage =
        "Upgrade @cogna8/openclaw-plugin to 0.3.0+ to enable confirm rules";

      // plugin_version_too_old_for_confirm is not a member of reason_code_t.
      // Persist null reasonCode and carry the upgrade text in message.
      storedReasonCode = null;
      storedMessage = responseMessage;
    } else {
      decision = "confirm";
      promptPayload = buildConfirmPrompt(match, normalizedCall);
      responseReasonCode = "confirmation_required";
      responseMessage = match.message;
      storedReasonCode = "confirmation_required";
      storedMessage = match.message;
    }
  } else {
    decision = "block";
    responseReasonCode = match.reasonCode;
    responseMessage = match.message;
    storedReasonCode = match.reasonCode;
    storedMessage = match.message;
  }

  const db = getDb();
  const result = await db.$transaction(async (tx: any) => {
    const period = await getOrCreateCurrentUsagePeriod(tx, accountId);

    // Bench accounts skip the monthly cap and the increment write entirely so
    // benchmark traffic doesn't churn usage counters or flip mode to degraded.
    let mode: "normal" | "degraded";
    if (benchAccount) {
      mode = "normal";
    } else {
      const limit = await getAccountEvaluationLimit(tx, accountId);
      const newCount = period.evaluationsUsed + 1;
      mode = newCount >= limit ? "degraded" : "normal";
    }

    let willStore = false;
    let isAllowSampled = false;

    if (decision === "block" || decision === "confirm") {
      willStore = true;
    } else if (mode !== "degraded") {
      isAllowSampled = shouldStoreAllowSample(
        period.id,
        body.session.id,
        body.tool_call.tool_name,
      );
      willStore = isAllowSampled;
    }

    if (!benchAccount) {
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
    }

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
        reasonCode: storedReasonCode,
        message: storedMessage,
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

  const base: EvaluateResult = {
    decision,
    mode: result.mode,
    rule: match ? { id: match.rulePublicId, type: match.ruleType } : null,
    reason_code: responseReasonCode,
    message: responseMessage,
    evaluation: {
      id: result.evaluationPublicId,
      stored: result.stored,
    },
  };

  if (decision === "confirm") {
    if (!promptPayload || !result.evaluationPublicId) {
      throw new Error("Confirm decision was not stored");
    }

    base.decision_id = result.evaluationPublicId;
    base.prompt = promptPayload;
    base.timeout_ms = 120000;
    base.timeout_behavior = "deny";
  }

  return base;
}
