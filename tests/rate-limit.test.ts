import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetRateLimitState } from "../src/middleware/rate-limit.js";
import { RateLimitError } from "../src/lib/errors.js";

describe("rate limiter", () => {
  beforeEach(() => {
    _resetRateLimitState();
  });

  it("allows up to 100 requests per minute", () => {
    for (let i = 0; i < 100; i++) {
      expect(() => checkRateLimit("key_test1")).not.toThrow();
    }
  });

  it("rejects the 101st request", () => {
    for (let i = 0; i < 100; i++) {
      checkRateLimit("key_test2");
    }
    expect(() => checkRateLimit("key_test2")).toThrow(RateLimitError);
  });

  it("provides Retry-After on rate limit error", () => {
    for (let i = 0; i < 100; i++) {
      checkRateLimit("key_test3");
    }
    try {
      checkRateLimit("key_test3");
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfter).toBeGreaterThan(0);
      expect((e as RateLimitError).retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it("isolates different API keys", () => {
    for (let i = 0; i < 100; i++) {
      checkRateLimit("key_a");
    }
    // key_a is exhausted, but key_b should be fine
    expect(() => checkRateLimit("key_b")).not.toThrow();
  });

  it("resets after window expires", async () => {
    // We can't easily wait 60 seconds, so we test via reset
    for (let i = 0; i < 100; i++) {
      checkRateLimit("key_reset");
    }
    expect(() => checkRateLimit("key_reset")).toThrow(RateLimitError);

    // Simulate window reset
    _resetRateLimitState();
    expect(() => checkRateLimit("key_reset")).not.toThrow();
  });

  describe("benchAccount bypass", () => {
    const benchAccount = { capabilityFlags: { benchAccount: true } };

    it("allows 200 calls within the window for a bench account", () => {
      for (let i = 0; i < 200; i++) {
        expect(() => checkRateLimit("key_bench", benchAccount)).not.toThrow();
      }
    });

    it("non-bench account still gets 429 on the 101st call", () => {
      const normal = { capabilityFlags: {} };
      for (let i = 0; i < 100; i++) {
        checkRateLimit("key_nonbench", normal);
      }
      expect(() => checkRateLimit("key_nonbench", normal)).toThrow(
        RateLimitError,
      );
    });

    it("bench bypass requires the flag to be exactly true", () => {
      const truthy = { capabilityFlags: { benchAccount: "true" } };
      for (let i = 0; i < 100; i++) {
        checkRateLimit("key_truthy", truthy);
      }
      expect(() => checkRateLimit("key_truthy", truthy)).toThrow(
        RateLimitError,
      );
    });

    it("bench bypass does not record state (other accounts unaffected)", () => {
      for (let i = 0; i < 500; i++) {
        checkRateLimit("key_shared", benchAccount);
      }
      // A non-bench call on the same key should still get a fresh window.
      for (let i = 0; i < 100; i++) {
        expect(() =>
          checkRateLimit("key_shared", { capabilityFlags: {} }),
        ).not.toThrow();
      }
      expect(() =>
        checkRateLimit("key_shared", { capabilityFlags: {} }),
      ).toThrow(RateLimitError);
    });

    it("missing account arg falls back to enforcement", () => {
      for (let i = 0; i < 100; i++) {
        checkRateLimit("key_missing_account");
      }
      expect(() => checkRateLimit("key_missing_account")).toThrow(
        RateLimitError,
      );
    });
  });
});
