export type CachedRule = {
  id: string;
  publicId: string;
  type: "block" | "confirm" | "exclude" | "protect" | "threshold";
  toolMatch: string | null;
  targetKind: "sender" | "path" | "resource_id" | null;
  targetValueNormalized: string | null;
  thresholdMax: number | null;
  thresholdPeriod: "session" | null;
};

type CacheEntry = {
  rules: CachedRule[];
  expiresAt: number;
};

const TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

export function getCachedActiveRules(agentId: string): CachedRule[] | null {
  const entry = cache.get(agentId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(agentId);
    return null;
  }
  return entry.rules;
}

export function setCachedActiveRules(agentId: string, rules: CachedRule[]): void {
  cache.set(agentId, { rules, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAgentRules(agentId: string): void {
  cache.delete(agentId);
}
