export type CachedRule = {
  id: string;
  publicId: string;
  type: "block" | "confirm" | "exclude" | "protect" | "threshold";
  toolMatch: string | null;
  toolMatchRegex: RegExp | null;
  targetKind: "sender" | "path" | "resource_id" | null;
  targetValueNormalized: string | null;
  targetValueRegex: RegExp | null;
  thresholdMax: number | null;
  thresholdPeriod: "session" | null;
};

type CacheEntry = {
  rules: CachedRule[];
  expiresAt: number;
};

const TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

// ─── Bench instrumentation (COG-166) ─────────────────────────────────
// Enabled when CG8_BENCH_INSTRUMENTATION=1. Tracks cache hits/misses for
// the v0.4 latency benchmark and logs totals every 30s. Remove after
// the benchmark per spec Step 11.
const BENCH_INSTRUMENTATION = process.env.CG8_BENCH_INSTRUMENTATION === "1";
let cacheHits = 0;
let cacheMisses = 0;

function recordHit(): void {
  if (!BENCH_INSTRUMENTATION) return;
  cacheHits += 1;
  maybeLogCacheStats();
}

function recordMiss(): void {
  if (!BENCH_INSTRUMENTATION) return;
  cacheMisses += 1;
  maybeLogCacheStats();
}

// Serverless-safe: emit on every Nth call instead of via setInterval, since
// Vercel lambda processes suspend between requests and timers never fire.
const BENCH_LOG_INTERVAL = 50;
function maybeLogCacheStats(): void {
  if (!BENCH_INSTRUMENTATION) return;
  const total = cacheHits + cacheMisses;
  if (total === 0 || total % BENCH_LOG_INTERVAL !== 0) return;
  const hitRate = cacheHits / total;
  console.log(
    JSON.stringify({
      bench: "rule_cache",
      hits: cacheHits,
      misses: cacheMisses,
      total,
      hit_rate: Number(hitRate.toFixed(4)),
    }),
  );
}

export function getCachedActiveRules(agentId: string): CachedRule[] | null {
  const entry = cache.get(agentId);
  if (!entry) {
    recordMiss();
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(agentId);
    recordMiss();
    return null;
  }
  recordHit();
  return entry.rules;
}

export function setCachedActiveRules(agentId: string, rules: CachedRule[]): void {
  cache.set(agentId, { rules, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAgentRules(agentId: string): void {
  cache.delete(agentId);
}
