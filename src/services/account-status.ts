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
};

function computePeriodBoundaries(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1));
  // Last millisecond: next month first day minus 1ms
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

  // Fetch account, current usage period, active agents, and recent block events
  const [account, usagePeriod, agents, recentEvents] = await Promise.all([
    db.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { plan: true, evaluationsLimitMonthly: true },
    }),

    // Current usage period: find by current month's periodStart
    (() => {
      const now = new Date();
      const periodStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      return db.usagePeriod.findFirst({
        where: { accountId, periodStart },
        select: { evaluationsUsed: true, mode: true },
      });
    })(),

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
        matchedRule: {
          select: { publicId: true },
        },
      },
    }),
  ]);

  const { periodStart, periodEnd } = computePeriodBoundaries();

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
  };
}
