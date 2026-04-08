import { generateEvaluationId } from "../lib/ids.js";

function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function shouldStoreAllowSample(
  usagePeriodId: string,
  sessionId: string,
  toolName: string,
): boolean {
  const key = `${usagePeriodId}:${sessionId}:${toolName}`;
  const h = fnv1aHash(key);
  return ((h ^ (h >>> 16)) >>> 0) % 20 === 0;
}

export type StoreEventArgs = {
  accountId: string;
  agentId: string;
  apiKeyId: string;
  usagePeriodId: string;
  matchedRuleId: string | null;
  decision: "allow" | "block";
  mode: "normal" | "degraded";
  reasonCode: string | null;
  message: string | null;
  sessionId: string;
  sessionKey: string | null;
  channelProvider: string | null;
  channelType: string | null;
  toolName: string;
  actionClass: string | null;
  targets: Record<string, unknown> | null;
  scope: Record<string, unknown> | null;
  rawInput: Record<string, unknown> | null;
};

export async function storeEvaluationEvent(
  tx: any,
  args: StoreEventArgs,
): Promise<{ publicId: string }> {
  const publicId = generateEvaluationId();

  await tx.evaluationEvent.create({
    data: {
      publicId,
      accountId: args.accountId,
      agentId: args.agentId,
      apiKeyId: args.apiKeyId,
      usagePeriodId: args.usagePeriodId,
      matchedRuleId: args.matchedRuleId,
      decision: args.decision,
      mode: args.mode,
      reasonCode: args.reasonCode ?? undefined,
      message: args.message,
      sessionId: args.sessionId,
      sessionKey: args.sessionKey,
      channelProvider: args.channelProvider,
      channelType: args.channelType ?? "unknown",
      toolName: args.toolName,
      actionClass: args.actionClass ?? undefined,
      targets: args.targets ?? undefined,
      scope: args.scope ?? undefined,
      rawInput: args.rawInput ?? undefined,
    },
  });

  return { publicId };
}
