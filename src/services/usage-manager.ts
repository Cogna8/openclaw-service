export type UsageUpdateArgs = {
  accountId: string;
  decision: "allow" | "block";
  willStoreEvent: boolean;
  storedEventIsAllowSampled: boolean;
};

export type UsageUpdateResult = {
  usagePeriodId: string;
  mode: "normal" | "degraded";
};

function getCurrentPeriodBounds(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

export async function getOrCreateCurrentUsagePeriod(
  tx: any,
  accountId: string,
): Promise<{ id: string; evaluationsUsed: number }> {
  const { periodStart, periodEnd } = getCurrentPeriodBounds();

  const existing = await tx.usagePeriod.findFirst({
    where: { accountId, periodStart },
    select: { id: true, evaluationsUsed: true },
  });

  if (existing) return existing;

  const created = await tx.usagePeriod.upsert({
    where: {
      accountId_periodStart: { accountId, periodStart },
    },
    create: {
      accountId,
      periodStart,
      periodEnd,
    },
    update: {},
    select: { id: true, evaluationsUsed: true },
  });

  return created;
}

export async function getAccountEvaluationLimit(
  tx: any,
  accountId: string,
): Promise<number> {
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { evaluationsLimitMonthly: true },
  });
  return account.evaluationsLimitMonthly;
}

export async function applyEvaluationUsage(
  tx: any,
  args: UsageUpdateArgs,
): Promise<UsageUpdateResult> {
  const period = await getOrCreateCurrentUsagePeriod(tx, args.accountId);
  const limit = await getAccountEvaluationLimit(tx, args.accountId);

  const incrementData: Record<string, number> = { evaluationsUsed: 1 };
  if (args.willStoreEvent && args.decision === "block") {
    incrementData.blocksStored = 1;
  }
  if (args.willStoreEvent && args.storedEventIsAllowSampled) {
    incrementData.allowsStoredSampled = 1;
  }

  const newEvalCount = period.evaluationsUsed + 1;
  const newMode = newEvalCount >= limit ? "degraded" : "normal";

  await tx.usagePeriod.update({
    where: { id: period.id },
    data: {
      ...Object.fromEntries(
        Object.entries(incrementData).map(([k, v]) => [k, { increment: v }]),
      ),
      mode: newMode,
    },
  });

  return {
    usagePeriodId: period.id,
    mode: newMode as "normal" | "degraded",
  };
}
