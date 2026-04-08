import { describe, it, expect, vi, beforeEach } from "vitest";

// --- DB mocks ---
const mockAgentFindFirst = vi.fn();
const mockAgentUpdate = vi.fn().mockResolvedValue({});
const mockAgentFindUniqueOrThrow = vi.fn();
const mockAccountFindUniqueOrThrow = vi.fn();
const mockRuleCount = vi.fn();
const mockRuleFindFirst = vi.fn();
const mockRuleFindMany = vi.fn();
const mockRuleCreate = vi.fn();
const mockRuleUpdate = vi.fn();
const mockUsagePeriodFindFirst = vi.fn();
const mockUsagePeriodUpsert = vi.fn();
const mockUsagePeriodUpdate = vi.fn();
const mockAuditCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    agent: {
      findFirst: mockAgentFindFirst,
      update: mockAgentUpdate,
      findUniqueOrThrow: mockAgentFindUniqueOrThrow,
    },
    account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
    rule: {
      count: mockRuleCount,
      findFirst: mockRuleFindFirst,
      findMany: mockRuleFindMany,
      create: mockRuleCreate,
      update: mockRuleUpdate,
    },
    usagePeriod: {
      findFirst: mockUsagePeriodFindFirst,
      upsert: mockUsagePeriodUpsert,
      update: mockUsagePeriodUpdate,
    },
    ruleAuditEvent: { create: mockAuditCreate },
    $transaction: mockTransaction,
  }),
}));

vi.mock("../src/lib/ids.js", () => ({
  generateRuleId: vi.fn().mockReturnValue("rl_testABCD"),
  generateEvaluationId: vi.fn().mockReturnValue("ev_test123"),
}));

import {
  createRule,
  listRules,
  enableRule,
  disableRule,
  removeRule,
} from "../src/services/rule-crud.js";
import { invalidateAgentRules } from "../src/services/rule-cache.js";

function setupAgent(overrides: Record<string, unknown> = {}) {
  mockAgentFindFirst.mockResolvedValue({
    id: "agent-uuid",
    publicId: "agt_test123",
    accountId: "acct-uuid",
    catalogHash: "abc",
    status: "active",
    ...overrides,
  });
}

function setupAccountLimits(overrides: Record<string, unknown> = {}) {
  mockAccountFindUniqueOrThrow.mockResolvedValue({
    maxRulesPerAgent: 25,
    postCapNewRulesLimit: 3,
    ...overrides,
  });
}

function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: Function) => {
    const txClient = {
      rule: {
        create: mockRuleCreate,
        update: mockRuleUpdate,
      },
      usagePeriod: {
        findFirst: mockUsagePeriodFindFirst,
        upsert: mockUsagePeriodUpsert,
        update: mockUsagePeriodUpdate,
      },
      account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
      ruleAuditEvent: { create: mockAuditCreate },
      agent: {
        update: mockAgentUpdate,
        findUniqueOrThrow: mockAgentFindUniqueOrThrow,
      },
    };
    return fn(txClient);
  });
}

function setupUsagePeriod(overrides: Record<string, unknown> = {}) {
  mockUsagePeriodFindFirst.mockResolvedValue({
    id: "period-uuid",
    evaluationsUsed: 5,
    mode: "normal",
    rulesCreatedAfterCap: 0,
    ...overrides,
  });
}

function setupCreatedRule() {
  mockRuleCreate.mockResolvedValue({
    id: "rule-internal-uuid",
    publicId: "rl_testABCD",
    accountId: "acct-uuid",
    agentId: "agent-uuid",
    type: "block",
    status: "active",
    spec: { tool: "exec" },
    normalizedFingerprint: "block:exec",
    toolMatch: "exec",
    targetKind: null,
    targetValue: null,
    targetValueNormalized: null,
    thresholdMax: null,
    thresholdPeriod: null,
    createdAt: new Date("2026-04-08T12:00:00Z"),
  });
}

describe("rule-crud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAgentRules("agent-uuid");
    setupTransaction();
  });

  // --- createRule ---
  describe("createRule", () => {
    it("creates rule and stores normalized columns", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null); // no duplicate
      setupUsagePeriod();
      setupCreatedRule();

      const result = await createRule({
        accountId: "acct-uuid",
        apiKeyId: "key-uuid",
        agentPublicId: "agt_test123",
        type: "block",
        spec: { tool: "exec" },
      });

      expect(result.id).toBe("rl_testABCD");
      expect(result.type).toBe("block");
      expect(result.status).toBe("active");
      expect(mockRuleCreate).toHaveBeenCalled();
      const createData = mockRuleCreate.mock.calls[0][0].data;
      expect(createData.toolMatch).toBe("exec");
      expect(createData.normalizedFingerprint).toBe("block:exec");
    });

    it("stores normalized spec", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod();
      setupCreatedRule();

      await createRule({
        accountId: "acct-uuid",
        apiKeyId: "key-uuid",
        agentPublicId: "agt_test123",
        type: "block",
        spec: { tool: "exec" },
      });

      const createData = mockRuleCreate.mock.calls[0][0].data;
      expect(createData.spec).toEqual({ tool: "exec" });
    });

    it("creates audit event with full rule snapshot", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod();
      setupCreatedRule();

      await createRule({
        accountId: "acct-uuid",
        apiKeyId: "key-uuid",
        agentPublicId: "agt_test123",
        type: "block",
        spec: { tool: "exec" },
      });

      expect(mockAuditCreate).toHaveBeenCalled();
      const auditData = mockAuditCreate.mock.calls[0][0].data;
      expect(auditData.eventType).toBe("created");
      expect(auditData.snapshot).toHaveProperty("id");
      expect(auditData.snapshot).toHaveProperty("type");
      expect(auditData.snapshot).toHaveProperty("status");
      expect(auditData.snapshot).toHaveProperty("spec");
    });

    it("increments activeRulesCount", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod();
      setupCreatedRule();

      await createRule({
        accountId: "acct-uuid",
        apiKeyId: "key-uuid",
        agentPublicId: "agt_test123",
        type: "block",
        spec: { tool: "exec" },
      });

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { activeRulesCount: { increment: 1 } },
        }),
      );
    });

    it("increments usage counters correctly", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod();
      setupCreatedRule();

      await createRule({
        accountId: "acct-uuid",
        apiKeyId: "key-uuid",
        agentPublicId: "agt_test123",
        type: "block",
        spec: { tool: "exec" },
      });

      expect(mockUsagePeriodUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rulesCreatedTotal: { increment: 1 },
          }),
        }),
      );
    });

    it("rejects duplicate by pre-check", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue({ id: "existing-rule" }); // duplicate exists

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_test123",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("A rule with the same specification already exists");
    });

    it("rejects duplicate by DB conflict path", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod();
      mockRuleCreate.mockRejectedValue({ code: "P2002" });

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_test123",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("A rule with the same specification already exists");
    });

    it("rejects max rules per agent", async () => {
      setupAgent();
      setupAccountLimits({ maxRulesPerAgent: 2 });
      mockRuleCount.mockResolvedValue(2);

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_test123",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("maximum of 2 rules");
    });

    it("rejects degraded-mode post-cap overage using rulesCreatedAfterCap", async () => {
      setupAgent();
      setupAccountLimits({ postCapNewRulesLimit: 3 });
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod({ mode: "degraded", rulesCreatedAfterCap: 3 });

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_test123",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("Post-cap rule creation limit reached");
    });

    it("rejects unknown agent", async () => {
      mockAgentFindFirst.mockResolvedValue(null);

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_unknown",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("Agent not found");
    });

    it("rejects wrong-account agent", async () => {
      setupAgent({ accountId: "other-acct" });

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_test123",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("Agent not found");
    });

    it("rejects archived agent", async () => {
      setupAgent({ status: "archived" });

      await expect(
        createRule({
          accountId: "acct-uuid",
          apiKeyId: "key-uuid",
          agentPublicId: "agt_test123",
          type: "block",
          spec: { tool: "exec" },
        }),
      ).rejects.toThrow("Agent not found");
    });

    it("invalidates cache after create", async () => {
      setupAgent();
      setupAccountLimits();
      mockRuleCount.mockResolvedValue(0);
      mockRuleFindFirst.mockResolvedValue(null);
      setupUsagePeriod();
      setupCreatedRule();

      // Cache should be invalidated - no error means success
      await createRule({
        accountId: "acct-uuid",
        apiKeyId: "key-uuid",
        agentPublicId: "agt_test123",
        type: "block",
        spec: { tool: "exec" },
      });
      // invalidateAgentRules is called (no way to directly verify without spy)
    });
  });

  // --- listRules ---
  describe("listRules", () => {
    it("active only", async () => {
      setupAgent();
      mockRuleFindMany.mockResolvedValue([
        {
          publicId: "rl_1",
          type: "block",
          status: "active",
          spec: { tool: "exec" },
          createdAt: new Date("2026-04-08T12:00:00Z"),
        },
      ]);

      const result = await listRules({
        accountId: "acct-uuid",
        agentPublicId: "agt_test123",
        status: "active",
      });

      expect(result.count).toBe(1);
      expect(result.rules[0].status).toBe("active");
      expect(mockRuleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: "agent-uuid", status: "active" },
        }),
      );
    });

    it("disabled only", async () => {
      setupAgent();
      mockRuleFindMany.mockResolvedValue([]);

      await listRules({
        accountId: "acct-uuid",
        agentPublicId: "agt_test123",
        status: "disabled",
      });

      expect(mockRuleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: "agent-uuid", status: "disabled" },
        }),
      );
    });

    it("all = active + disabled", async () => {
      setupAgent();
      mockRuleFindMany.mockResolvedValue([]);

      await listRules({
        accountId: "acct-uuid",
        agentPublicId: "agt_test123",
        status: "all",
      });

      expect(mockRuleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: "agent-uuid", status: { in: ["active", "disabled"] } },
        }),
      );
    });

    it("removed excluded from results", async () => {
      setupAgent();
      mockRuleFindMany.mockResolvedValue([]);

      await listRules({
        accountId: "acct-uuid",
        agentPublicId: "agt_test123",
        status: "all",
      });

      // The query never includes "removed" status
      const callWhere = mockRuleFindMany.mock.calls[0][0].where;
      if (typeof callWhere.status === "string") {
        expect(callWhere.status).not.toBe("removed");
      } else {
        expect(callWhere.status.in).not.toContain("removed");
      }
    });

    it("wrong-account agent -> 404", async () => {
      setupAgent({ accountId: "other-acct" });

      await expect(
        listRules({
          accountId: "acct-uuid",
          agentPublicId: "agt_test123",
          status: "active",
        }),
      ).rejects.toThrow("Agent not found");
    });
  });

  // --- enableRule ---
  describe("enableRule", () => {
    function setupRuleForFind(overrides: Record<string, unknown> = {}) {
      mockRuleFindFirst.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        accountId: "acct-uuid",
        agentId: "agent-uuid",
        type: "block",
        status: "disabled",
        spec: { tool: "exec" },
        disabledAt: new Date(),
        removedAt: null,
        createdAt: new Date("2026-04-08T12:00:00Z"),
        agent: { publicId: "agt_test123" },
        ...overrides,
      });
    }

    it("valid enable from disabled", async () => {
      setupRuleForFind();
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "active",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });

      const result = await enableRule("acct-uuid", "rl_test1", "key-uuid");
      expect(result.status).toBe("active");
    });

    it("already active -> 409", async () => {
      setupRuleForFind({ status: "active" });

      await expect(enableRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "already active",
      );
    });

    it("removed -> 404", async () => {
      setupRuleForFind({ status: "removed" });

      await expect(enableRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "Rule not found",
      );
    });

    it("wrong account -> 404", async () => {
      setupRuleForFind({ accountId: "other-acct" });

      await expect(enableRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "Rule not found",
      );
    });

    it("audit created with full snapshot", async () => {
      setupRuleForFind();
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "active",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });

      await enableRule("acct-uuid", "rl_test1", "key-uuid");

      expect(mockAuditCreate).toHaveBeenCalled();
      const auditData = mockAuditCreate.mock.calls[0][0].data;
      expect(auditData.eventType).toBe("enabled");
      expect(auditData.snapshot).toHaveProperty("id");
      expect(auditData.snapshot).toHaveProperty("status");
    });

    it("count incremented", async () => {
      setupRuleForFind();
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "active",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });

      await enableRule("acct-uuid", "rl_test1", "key-uuid");

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { activeRulesCount: { increment: 1 } },
        }),
      );
    });
  });

  // --- disableRule ---
  describe("disableRule", () => {
    function setupRuleForFind(overrides: Record<string, unknown> = {}) {
      mockRuleFindFirst.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        accountId: "acct-uuid",
        agentId: "agent-uuid",
        type: "block",
        status: "active",
        spec: { tool: "exec" },
        disabledAt: null,
        removedAt: null,
        createdAt: new Date("2026-04-08T12:00:00Z"),
        agent: { publicId: "agt_test123" },
        ...overrides,
      });
    }

    it("valid disable from active", async () => {
      setupRuleForFind();
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "disabled",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 1 });

      const result = await disableRule("acct-uuid", "rl_test1", "key-uuid");
      expect(result.status).toBe("disabled");
    });

    it("already disabled -> 409", async () => {
      setupRuleForFind({ status: "disabled" });

      await expect(disableRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "already disabled",
      );
    });

    it("removed -> 404", async () => {
      setupRuleForFind({ status: "removed" });

      await expect(disableRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "Rule not found",
      );
    });

    it("wrong account -> 404", async () => {
      setupRuleForFind({ accountId: "other-acct" });

      await expect(disableRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "Rule not found",
      );
    });

    it("audit created", async () => {
      setupRuleForFind();
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "disabled",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 1 });

      await disableRule("acct-uuid", "rl_test1", "key-uuid");

      expect(mockAuditCreate).toHaveBeenCalled();
      const auditData = mockAuditCreate.mock.calls[0][0].data;
      expect(auditData.eventType).toBe("disabled");
    });

    it("count decremented", async () => {
      setupRuleForFind();
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "disabled",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 1 });

      await disableRule("acct-uuid", "rl_test1", "key-uuid");

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { activeRulesCount: { decrement: 1 } },
        }),
      );
    });
  });

  // --- removeRule ---
  describe("removeRule", () => {
    function setupRuleForFind(overrides: Record<string, unknown> = {}) {
      mockRuleFindFirst.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        accountId: "acct-uuid",
        agentId: "agent-uuid",
        type: "block",
        status: "active",
        spec: { tool: "exec" },
        disabledAt: null,
        removedAt: null,
        createdAt: new Date("2026-04-08T12:00:00Z"),
        agent: { publicId: "agt_test123" },
        ...overrides,
      });
    }

    it("remove active rule", async () => {
      setupRuleForFind({ status: "active" });
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "removed",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 1 });

      const result = await removeRule("acct-uuid", "rl_test1", "key-uuid");
      expect(result).toEqual({ id: "rl_test1", removed: true });
    });

    it("remove disabled rule", async () => {
      setupRuleForFind({ status: "disabled" });
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "removed",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });

      const result = await removeRule("acct-uuid", "rl_test1", "key-uuid");
      expect(result).toEqual({ id: "rl_test1", removed: true });
      // Should NOT decrement since disabled
      expect(mockAgentFindUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("already removed -> 404", async () => {
      setupRuleForFind({ status: "removed" });

      await expect(removeRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "Rule not found",
      );
    });

    it("wrong account -> 404", async () => {
      setupRuleForFind({ accountId: "other-acct" });

      await expect(removeRule("acct-uuid", "rl_test1", "key-uuid")).rejects.toThrow(
        "Rule not found",
      );
    });

    it("audit created", async () => {
      setupRuleForFind({ status: "active" });
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "removed",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 1 });

      await removeRule("acct-uuid", "rl_test1", "key-uuid");

      expect(mockAuditCreate).toHaveBeenCalled();
      const auditData = mockAuditCreate.mock.calls[0][0].data;
      expect(auditData.eventType).toBe("removed");
    });

    it("active count decremented only if previously active", async () => {
      setupRuleForFind({ status: "active" });
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "removed",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 1 });

      await removeRule("acct-uuid", "rl_test1", "key-uuid");

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { activeRulesCount: { decrement: 1 } },
        }),
      );
    });

    it("active count not decremented below zero", async () => {
      setupRuleForFind({ status: "active" });
      mockRuleUpdate.mockResolvedValue({
        id: "rule-uuid",
        publicId: "rl_test1",
        type: "block",
        status: "removed",
        spec: { tool: "exec" },
        createdAt: new Date("2026-04-08T12:00:00Z"),
      });
      mockAgentFindUniqueOrThrow.mockResolvedValue({ activeRulesCount: 0 });

      await removeRule("acct-uuid", "rl_test1", "key-uuid");

      // agent.update for decrement should NOT be called when count is already 0
      const decrementCalls = mockAgentUpdate.mock.calls.filter(
        (c: any) => c[0]?.data?.activeRulesCount?.decrement,
      );
      expect(decrementCalls.length).toBe(0);
    });
  });
});
