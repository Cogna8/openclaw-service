import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrCreateCurrentUsagePeriod,
  getAccountEvaluationLimit,
  applyEvaluationUsage,
} from "../src/services/usage-manager.js";

function makeTx({
  existingPeriod = null as any,
  accountLimit = 10000,
} = {}) {
  const updatedPeriod = { ...existingPeriod };
  return {
    usagePeriod: {
      findFirst: vi.fn().mockResolvedValue(existingPeriod),
      upsert: vi.fn().mockImplementation(({ create }) => {
        return Promise.resolve({
          id: "new-period-uuid",
          evaluationsUsed: 0,
          ...create,
        });
      }),
      update: vi.fn().mockResolvedValue(updatedPeriod),
    },
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        evaluationsLimitMonthly: accountLimit,
      }),
    },
  };
}

describe("usage-manager", () => {
  describe("getOrCreateCurrentUsagePeriod", () => {
    it("creates current period if none exists", async () => {
      const tx = makeTx({ existingPeriod: null });
      const result = await getOrCreateCurrentUsagePeriod(tx, "acct-uuid");
      expect(tx.usagePeriod.findFirst).toHaveBeenCalled();
      expect(tx.usagePeriod.upsert).toHaveBeenCalled();
      expect(result.id).toBe("new-period-uuid");
      expect(result.evaluationsUsed).toBe(0);
    });

    it("returns existing period if already present", async () => {
      const tx = makeTx({
        existingPeriod: { id: "existing-uuid", evaluationsUsed: 42 },
      });
      const result = await getOrCreateCurrentUsagePeriod(tx, "acct-uuid");
      expect(tx.usagePeriod.upsert).not.toHaveBeenCalled();
      expect(result.id).toBe("existing-uuid");
      expect(result.evaluationsUsed).toBe(42);
    });
  });

  describe("getAccountEvaluationLimit", () => {
    it("returns the account evaluation limit", async () => {
      const tx = makeTx({ accountLimit: 5000 });
      const limit = await getAccountEvaluationLimit(tx, "acct-uuid");
      expect(limit).toBe(5000);
    });
  });

  describe("applyEvaluationUsage", () => {
    it("increments evaluationsUsed every call", async () => {
      const tx = makeTx({
        existingPeriod: { id: "period-uuid", evaluationsUsed: 5 },
        accountLimit: 10000,
      });
      await applyEvaluationUsage(tx, {
        accountId: "acct-uuid",
        decision: "allow",
        willStoreEvent: false,
        storedEventIsAllowSampled: false,
      });
      expect(tx.usagePeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evaluationsUsed: { increment: 1 },
          }),
        }),
      );
    });

    it("increments blocksStored only for stored blocks", async () => {
      const tx = makeTx({
        existingPeriod: { id: "period-uuid", evaluationsUsed: 5 },
        accountLimit: 10000,
      });
      await applyEvaluationUsage(tx, {
        accountId: "acct-uuid",
        decision: "block",
        willStoreEvent: true,
        storedEventIsAllowSampled: false,
      });
      expect(tx.usagePeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            blocksStored: { increment: 1 },
          }),
        }),
      );
    });

    it("does not increment blocksStored when willStoreEvent is false", async () => {
      const tx = makeTx({
        existingPeriod: { id: "period-uuid", evaluationsUsed: 5 },
        accountLimit: 10000,
      });
      await applyEvaluationUsage(tx, {
        accountId: "acct-uuid",
        decision: "block",
        willStoreEvent: false,
        storedEventIsAllowSampled: false,
      });
      const updateData = tx.usagePeriod.update.mock.calls[0][0].data;
      expect(updateData.blocksStored).toBeUndefined();
    });

    it("increments allowsStoredSampled only for sampled allow storage", async () => {
      const tx = makeTx({
        existingPeriod: { id: "period-uuid", evaluationsUsed: 5 },
        accountLimit: 10000,
      });
      await applyEvaluationUsage(tx, {
        accountId: "acct-uuid",
        decision: "allow",
        willStoreEvent: true,
        storedEventIsAllowSampled: true,
      });
      expect(tx.usagePeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allowsStoredSampled: { increment: 1 },
          }),
        }),
      );
    });

    it("flips mode to degraded when evaluationsUsed >= limit", async () => {
      const tx = makeTx({
        existingPeriod: { id: "period-uuid", evaluationsUsed: 9999 },
        accountLimit: 10000,
      });
      const result = await applyEvaluationUsage(tx, {
        accountId: "acct-uuid",
        decision: "allow",
        willStoreEvent: false,
        storedEventIsAllowSampled: false,
      });
      expect(result.mode).toBe("degraded");
      expect(tx.usagePeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mode: "degraded",
          }),
        }),
      );
    });

    it("stays normal when evaluationsUsed < limit after increment", async () => {
      const tx = makeTx({
        existingPeriod: { id: "period-uuid", evaluationsUsed: 5 },
        accountLimit: 10000,
      });
      const result = await applyEvaluationUsage(tx, {
        accountId: "acct-uuid",
        decision: "allow",
        willStoreEvent: false,
        storedEventIsAllowSampled: false,
      });
      expect(result.mode).toBe("normal");
    });

    it("race-safe period creation (upsert behavior)", async () => {
      const tx = makeTx({ existingPeriod: null });
      const result = await getOrCreateCurrentUsagePeriod(tx, "acct-uuid");
      const upsertCall = tx.usagePeriod.upsert.mock.calls[0][0];
      // Upsert uses the unique constraint key
      expect(upsertCall.where).toHaveProperty("accountId_periodStart");
      expect(upsertCall.update).toEqual({});
      expect(result).toBeDefined();
    });
  });
});
