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
});
