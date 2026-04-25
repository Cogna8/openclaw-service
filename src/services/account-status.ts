import { getDb } from "../lib/db.js";

export type AccountStatusResult = {
  account: {
    plan: string;
    evaluations_used: number;
    evaluations_limit: number;
    period_start: string;
    period_end: string;
    mode: string;
  };
  agents: Array<{
    id: string;
    name: string;
    tools_registered: number;
    active_rules: number;
    last_seen_at: string;
  }>;
  recent_events: Array<{
    type: string;
    tool_name: string;
    rule_id: string | null;
    reason_code: string | null;
    message: string | null;
    at: string;
  }>;
  approvals: {
    requested: number;
    resolved_allow: number;
    resolved_deny: number;
    resolved_timeout: number;
    unresolved: number;
  };
};

function computePeriodBoundaries(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1) - 1);

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

export async function getAccountStatus(
  accountId: string,
): Promise<AccountStatusResult> {
  const db = getDb();

  const now = new Date();
  const periodStartDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEndDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const [account, usagePeriod, agents, recentEvents, approvalGroups] =
    await Promise.all([
      db.account.findUniqueOrThrow({
        where: { id: accountId },
        select: { plan: true, evaluationsLimitMonthly: true },
      }),

      db.usagePeriod.findFirst({
        where: { accountId, periodStart: periodStartDate },
        select: { evaluationsUsed: true, mode: true },
      }),

      db.agent.findMany({
        where: { accountId, status: "active" },
        orderBy: { lastSeenAt: "desc" },
        select: {
          publicId: true,
          name: true,
          toolsRegisteredCount: true,
          activeRulesCount: true,
          lastSeenAt: true,
        },
      }),

      db.evaluationEvent.findMany({
        where: { accountId, decision: "block" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          toolName: true,
          reasonCode: true,
          message: true,
          createdAt: true,
          matchedRule: { select: { publicId: true } },
        },
      }),

      db.evaluationEvent.groupBy({
        by: ["resolution"],
        where: {
          accountId,
          decision: "confirm",
          createdAt: { gte: periodStartDate, lt: periodEndDate },
        },
        _count: { _all: true },
      }),
    ]);

  const { periodStart, periodEnd } = computePeriodBoundaries();

  let requested = 0;
  let resolvedAllow = 0;
  let resolvedDeny = 0;
  let resolvedTimeout = 0;
  let unresolved = 0;

  for (const row of approvalGroups as Array<{
    resolution: string | null;
    _count: { _all: number };
  }>) {
    const count = row._count?._all ?? 0;
    requested += count;
    if (row.resolution === "allow_once" || row.resolution === "allow_always") {
      resolvedAllow += count;
    } else if (row.resolution === "deny" || row.resolution === "cancelled") {
      resolvedDeny += count;
    } else if (row.resolution === "timeout") {
      resolvedTimeout += count;
    } else if (row.resolution === null) {
      unresolved += count;
    }
  }

  return {
    account: {
      plan: account.plan,
      evaluations_used: usagePeriod?.evaluationsUsed ?? 0,
      evaluations_limit: account.evaluationsLimitMonthly,
      period_start: periodStart,
      period_end: periodEnd,
      mode: usagePeriod?.mode ?? "normal",
    },
    agents: agents.map((a: any) => ({
      id: a.publicId,
      name: a.name,
      tools_registered: a.toolsRegisteredCount,
      active_rules: a.activeRulesCount,
      last_seen_at:
        a.lastSeenAt instanceof Date
          ? a.lastSeenAt.toISOString()
          : String(a.lastSeenAt),
    })),
    recent_events: recentEvents.map((e: any) => ({
      type: "block",
      tool_name: e.toolName,
      rule_id: e.matchedRule?.publicId ?? null,
      reason_code: e.reasonCode ?? null,
      message: e.message ?? null,
      at:
        e.createdAt instanceof Date
          ? e.createdAt.toISOString()
          : String(e.createdAt),
    })),
    approvals: {
      requested,
      resolved_allow: resolvedAllow,
      resolved_deny: resolvedDeny,
      resolved_timeout: resolvedTimeout,
      unresolved,
    },
  };
}
