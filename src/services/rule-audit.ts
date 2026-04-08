export type CreateAuditArgs = {
  accountId: string;
  agentId: string;
  ruleId: string;
  eventType: "created" | "enabled" | "disabled" | "removed";
  actorType: "api_key";
  actorApiKeyId: string;
  snapshot: Record<string, unknown>;
};

export async function createRuleAuditEvent(
  tx: any,
  args: CreateAuditArgs,
): Promise<void> {
  await tx.ruleAuditEvent.create({
    data: {
      accountId: args.accountId,
      agentId: args.agentId,
      ruleId: args.ruleId,
      eventType: args.eventType,
      actorType: args.actorType,
      actorApiKeyId: args.actorApiKeyId,
      snapshot: args.snapshot,
    },
  });
}
