import { getDb } from "../lib/db.js";
import {
  getCachedActiveRules,
  setCachedActiveRules,
  type CachedRule,
} from "./rule-cache.js";
import { globToRegex, hasGlob } from "../lib/glob-to-regex.js";

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
    toolMatchRegex:
      r.toolMatch !== null && hasGlob(r.toolMatch)
        ? globToRegex(r.toolMatch.toLowerCase())
        : null,
    targetKind: r.targetKind as CachedRule["targetKind"],
    targetValueNormalized: r.targetValueNormalized,
    targetValueRegex:
      r.targetValueNormalized !== null && hasGlob(r.targetValueNormalized)
        ? globToRegex(r.targetValueNormalized.toLowerCase())
        : null,
    thresholdMax: r.thresholdMax,
    thresholdPeriod: r.thresholdPeriod as CachedRule["thresholdPeriod"],
  }));

  setCachedActiveRules(agentId, rules);
  return rules;
}
