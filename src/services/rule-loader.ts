import { getDb } from "../lib/db.js";
import {
  getCachedActiveRules,
  setCachedActiveRules,
  type CachedRule,
} from "./rule-cache.js";

export type { CachedRule };

export async function loadActiveRulesForAgent(agentId: string): Promise<CachedRule[]> {
  const cached = getCachedActiveRules(agentId);
  if (cached) return cached;

  const db = getDb();
  const rows = await db.rule.findMany({
    where: { agentId, status: "active" },
    select: {
      id: true,
      publicId: true,
      type: true,
      toolMatch: true,
      targetKind: true,
      targetValueNormalized: true,
      thresholdMax: true,
      thresholdPeriod: true,
    },
  });

  const rules: CachedRule[] = rows.map((r) => ({
    id: r.id,
    publicId: r.publicId,
    type: r.type as CachedRule["type"],
    toolMatch: r.toolMatch,
    targetKind: r.targetKind as CachedRule["targetKind"],
    targetValueNormalized: r.targetValueNormalized,
    thresholdMax: r.thresholdMax,
    thresholdPeriod: r.thresholdPeriod as CachedRule["thresholdPeriod"],
  }));

  setCachedActiveRules(agentId, rules);
  return rules;
}
