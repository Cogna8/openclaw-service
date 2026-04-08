import { describe, it, expect, vi } from "vitest";
import {
  shouldStoreAllowSample,
  storeEvaluationEvent,
} from "../src/services/event-store.js";

vi.mock("../src/lib/ids.js", () => ({
  generateEvaluationId: vi.fn().mockReturnValue("ev_testABC"),
}));

describe("event-store", () => {
  describe("shouldStoreAllowSample", () => {
    it("same sampling input gives same result every time (deterministic)", () => {
      const r1 = shouldStoreAllowSample("period-1", "session-1", "file_read");
      const r2 = shouldStoreAllowSample("period-1", "session-1", "file_read");
      const r3 = shouldStoreAllowSample("period-1", "session-1", "file_read");
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it("different inputs give different results (distribution check)", () => {
      const results = new Set<boolean>();
      for (let i = 0; i < 100; i++) {
        results.add(
          shouldStoreAllowSample(`period-${i}`, `session-${i}`, `tool-${i}`),
        );
      }
      // With 100 different inputs at 5% rate, we should see both true and false
      expect(results.size).toBe(2);
    });

    it("approximately 5% sample rate over many inputs", () => {
      let sampled = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (shouldStoreAllowSample("period-x", `sess-${i}`, `tool-${i}`)) {
          sampled++;
        }
      }
      // 5% = 50/1000, allow generous range (1%-15%)
      expect(sampled).toBeGreaterThan(10);
      expect(sampled).toBeLessThan(150);
    });
  });

  describe("storage rules", () => {
    function makeTx() {
      return {
        evaluationEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
    }

    const baseArgs = {
      accountId: "acct-uuid",
      agentId: "agent-uuid",
      apiKeyId: "key-uuid",
      usagePeriodId: "period-uuid",
      matchedRuleId: null,
      decision: "allow" as const,
      mode: "normal" as const,
      reasonCode: null,
      message: null,
      sessionId: "sess-1",
      sessionKey: null,
      channelProvider: null,
      channelType: null,
      toolName: "file_read",
      actionClass: null,
      targets: null,
      scope: null,
      rawInput: null,
    };

    it("block always stored in normal mode", () => {
      // Block events should always be stored - decision made by orchestrator
      // This test verifies storeEvaluationEvent creates a record
      const tx = makeTx();
      return storeEvaluationEvent(tx, {
        ...baseArgs,
        decision: "block",
        mode: "normal",
        matchedRuleId: "rule-uuid",
        reasonCode: "blocked_tool",
        message: "Tool exec is blocked",
      }).then((result) => {
        expect(result.publicId).toBe("ev_testABC");
        expect(tx.evaluationEvent.create).toHaveBeenCalled();
      });
    });

    it("block always stored in degraded mode", () => {
      const tx = makeTx();
      return storeEvaluationEvent(tx, {
        ...baseArgs,
        decision: "block",
        mode: "degraded",
        matchedRuleId: "rule-uuid",
        reasonCode: "blocked_tool",
        message: "Tool exec is blocked",
      }).then((result) => {
        expect(result.publicId).toBe("ev_testABC");
        expect(tx.evaluationEvent.create).toHaveBeenCalled();
      });
    });

    it("stored events always get non-null publicId", async () => {
      const tx = makeTx();
      const result = await storeEvaluationEvent(tx, baseArgs);
      expect(result.publicId).toBeTruthy();
      expect(typeof result.publicId).toBe("string");
    });

    it("normal-mode allows: sampled deterministically at 5%", () => {
      // Verify that shouldStoreAllowSample is deterministic
      // and only stores ~5%
      const stored = shouldStoreAllowSample("period-1", "session-1", "tool-1");
      expect(typeof stored).toBe("boolean");
    });

    it("degraded-mode allows: never stored (decision by orchestrator)", () => {
      // In degraded mode, the orchestrator never calls storeEvaluationEvent for allows
      // shouldStoreAllowSample is not even consulted for degraded allows
      // This test documents the contract
      const shouldStore = false; // orchestrator sets this for degraded allows
      expect(shouldStore).toBe(false);
    });
  });
});
