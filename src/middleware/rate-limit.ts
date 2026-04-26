import { RateLimitError } from "../lib/errors.js";
import { isBenchAccount } from "../lib/account-flags.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
const CLEANUP_INTERVAL_MS = 60_000;

type WindowEntry = {
  count: number;
  windowStart: number;
};

const windows = new Map<string, WindowEntry>();

// Periodic cleanup of expired entries
let cleanupTimer: ReturnType<typeof setInterval> | undefined;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now - entry.windowStart >= WINDOW_MS) {
        windows.delete(key);
      }
    }
    if (windows.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = undefined;
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow process to exit even if timer is running
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function checkRateLimit(
  apiKeyId: string,
  account?: { capabilityFlags?: unknown },
): void {
  if (account && isBenchAccount(account.capabilityFlags)) {
    return;
  }

  const now = Date.now();
  const entry = windows.get(apiKeyId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    windows.set(apiKeyId, { count: 1, windowStart: now });
    ensureCleanup();
    return;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    throw new RateLimitError(retryAfter);
  }
}

// Exported for testing
export function _resetRateLimitState(): void {
  windows.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
}
