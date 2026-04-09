import { describe, it, expect, vi, beforeEach } from "vitest";

// --- DB mocks ---
const mockAgentFindFirst = vi.fn();
const mockAgentCreate = vi.fn();
const mockAgentUpdate = vi.fn();
const mockAgentCount = vi.fn();
const mockAccountFindUniqueOrThrow = vi.fn();
const mockAgentToolCreate = vi.fn();
const mockAgentToolUpdateMany = vi.fn();
const mockAgentToolFindFirst = vi.fn();
const mockAgentToolUpdate = vi.fn();
const mockAgentToolCount = vi.fn();
const mockUsagePeriodFindFirst = vi.fn();
const mockUsagePeriodUpsert = vi.fn();
const mockUsagePeriodUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    agent: {
      findFirst: mockAgentFindFirst,
      create: mockAgentCreate,
      update: mockAgentUpdate,
      count: mockAgentCount,
    },
    account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
    agentTool: {
      create: mockAgentToolCreate,
      updateMany: mockAgentToolUpdateMany,
      findFirst: mockAgentToolFindFirst,
      update: mockAgentToolUpdate,
      count: mockAgentToolCount,
    },
    usagePeriod: {
      findFirst: mockUsagePeriodFindFirst,
      upsert: mockUsagePeriodUpsert,
      update: mockUsagePeriodUpdate,
    },
    $transaction: mockTransaction,
  }),
}));

vi.mock("../src/lib/ids.js", () => ({
  generateAgentId: vi.fn().mockReturnValue("agt_testABCD"),
}));

const mockInvalidateAgentRules = vi.fn();
vi.mock("../src/services/rule-cache.js", () => ({
  invalidateAgentRules: (...args: any[]) => mockInvalidateAgentRules(...args),
}));

import { registerAgent } from "../src/services/agent-registration.js";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acct-uuid",
    body: {
      agent: {
        external_id: "ext-123",
        name: "test-agent:main",
        plugin_version: "1.0.0",
        agent_version: "2.0.0",
      },
      tools: [
        { name: "file_read", action_class: "file_read" },
        { name: "exec_cmd", action_class: "exec" },
      ],
      catalog_hash: "hash_abc123",
      ...overrides,
    },
  };
}

function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: Function) => {
    const txClient = {
      agent: {
        findFirst: mockAgentFindFirst,
        create: mockAgentCreate,
        update: mockAgentUpdate,
        count: mockAgentCount,
      },
      account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
      agentTool: {
        create: mockAgentToolCreate,
        updateMany: mockAgentToolUpdateMany,
        findFirst: mockAgentToolFindFirst,
        update: mockAgentToolUpdate,
        count: mockAgentToolCount,
      },
      usagePeriod: {
        findFirst: mockUsagePeriodFindFirst,
        upsert: mockUsagePeriodUpsert,
        update: mockUsagePeriodUpdate,
      },
    };
    return fn(txClient);
  });
}

function setupAccountLimits(maxAgents = 3) {
  mockAccountFindUniqueOrThrow.mockResolvedValue({ maxAgents });
}

function setupUsagePeriod() {
  mockUsagePeriodFindFirst.mockResolvedValue({
    id: "period-uuid",
    evaluationsUsed: 0,
  });
}

describe("agent-registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  // --- New agent ---
  describe("new agent", () => {
    beforeEach(() => {
      mockAgentFindFirst.mockResolvedValue(null); // no existing agent
      setupAccountLimits();
      setupUsagePeriod();
      mockAgentCount.mockResolvedValue(0);
      mockAgentCreate.mockResolvedValue({
        id: "agent-internal-uuid",
        publicId: "agt_testABCD",
        toolsRegisteredCount: 2,
        activeRulesCount: 0,
      });
    });

    it("creates agent with correct fields", async () => {
      const result = await registerAgent(makeInput());

      expect(mockAgentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publicId: "agt_testABCD",
            accountId: "acct-uuid",
            source: "openclaw",
            externalId: "ext-123",
            name: "test-agent:main",
            pluginVersion: "1.0.0",
            agentVersion: "2.0.0",
            catalogHash: "hash_abc123",
            toolsRegisteredCount: 2,
            status: "active",
          }),
        }),
      );
      expect(result.agent.id).toBe("agt_testABCD");
    });

    it("generates agt_ public ID", async () => {
      const result = await registerAgent(makeInput());
      expect(result.agent.id).toMatch(/^agt_/);
    });

    it("creates all tool rows", async () => {
      await registerAgent(makeInput());

      expect(mockAgentToolCreate).toHaveBeenCalledTimes(2);
      expect(mockAgentToolCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toolName: "file_read",
            actionClass: "file_read",
            isActive: true,
          }),
        }),
      );
      expect(mockAgentToolCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toolName: "exec_cmd",
            actionClass: "exec",
            isActive: true,
          }),
        }),
      );
    });

    it("sets toolsRegisteredCount correctly", async () => {
      await registerAgent(makeInput());

      expect(mockAgentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toolsRegisteredCount: 2,
          }),
        }),
      );
    });

    it("stores catalogHash", async () => {
      await registerAgent(makeInput());

      expect(mockAgentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            catalogHash: "hash_abc123",
          }),
        }),
      );
    });

    it("increments agentsRegistered on usage period", async () => {
      await registerAgent(makeInput());

      expect(mockUsagePeriodUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "period-uuid" },
          data: { agentsRegistered: { increment: 1 } },
        }),
      );
    });

    it("returns status 'created'", async () => {
      const result = await registerAgent(makeInput());
      expect(result.agent.status).toBe("created");
    });

    it("rejects when active agent count >= maxAgents", async () => {
      mockAgentCount.mockResolvedValue(3);

      await expect(registerAgent(makeInput())).rejects.toThrow(
        "Maximum of 3 active agents per account reached",
      );
    });
  });

  // --- Existing agent (same hash) ---
  describe("existing agent (same hash)", () => {
    const existingAgent = {
      id: "agent-internal-uuid",
      publicId: "agt_existing1",
      accountId: "acct-uuid",
      source: "openclaw",
      externalId: "ext-123",
      name: "old-name",
      pluginVersion: "0.9.0",
      agentVersion: "1.0.0",
      catalogHash: "hash_abc123",
      toolsRegisteredCount: 2,
      activeRulesCount: 3,
      status: "active",
    };

    beforeEach(() => {
      mockAgentFindFirst.mockResolvedValue(existingAgent);
      mockAgentUpdate.mockResolvedValue({
        ...existingAgent,
        name: "test-agent:main",
        pluginVersion: "1.0.0",
        agentVersion: "2.0.0",
        publicId: "agt_existing1",
        toolsRegisteredCount: 2,
        activeRulesCount: 3,
      });
    });

    it("updates name, versions, lastSeenAt", async () => {
      await registerAgent(makeInput());

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "agent-internal-uuid" },
          data: expect.objectContaining({
            name: "test-agent:main",
            pluginVersion: "1.0.0",
            agentVersion: "2.0.0",
            lastSeenAt: expect.any(Date),
          }),
        }),
      );
    });

    it("does not re-sync tools", async () => {
      await registerAgent(makeInput());

      expect(mockAgentToolUpdateMany).not.toHaveBeenCalled();
      expect(mockAgentToolCreate).not.toHaveBeenCalled();
      expect(mockAgentToolFindFirst).not.toHaveBeenCalled();
    });

    it("returns status 'synced'", async () => {
      const result = await registerAgent(makeInput());
      expect(result.agent.status).toBe("synced");
    });
  });

  // --- Existing agent (different hash) ---
  describe("existing agent (different hash)", () => {
    const existingAgent = {
      id: "agent-internal-uuid",
      publicId: "agt_existing1",
      accountId: "acct-uuid",
      source: "openclaw",
      externalId: "ext-123",
      name: "old-name",
      pluginVersion: "0.9.0",
      agentVersion: "1.0.0",
      catalogHash: "old_hash_xyz",
      toolsRegisteredCount: 2,
      activeRulesCount: 3,
      status: "active",
    };

    beforeEach(() => {
      mockAgentFindFirst.mockResolvedValue(existingAgent);
      mockAgentToolCount.mockResolvedValue(2);
      mockAgentUpdate.mockResolvedValue({
        ...existingAgent,
        catalogHash: "hash_abc123",
        toolsRegisteredCount: 2,
        activeRulesCount: 3,
        publicId: "agt_existing1",
      });
    });

    it("performs full catalog sync", async () => {
      mockAgentToolFindFirst.mockResolvedValue(null); // all new tools

      await registerAgent(makeInput());

      // Should mark all existing tools inactive
      expect(mockAgentToolUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: "agent-internal-uuid" },
          data: { isActive: false },
        }),
      );
    });

    it("marks old tools inactive", async () => {
      mockAgentToolFindFirst.mockResolvedValue(null);

      await registerAgent(makeInput());

      expect(mockAgentToolUpdateMany).toHaveBeenCalledWith({
        where: { agentId: "agent-internal-uuid" },
        data: { isActive: false },
      });
    });

    it("adds new tools", async () => {
      mockAgentToolFindFirst.mockResolvedValue(null); // no existing tools found

      await registerAgent(makeInput());

      expect(mockAgentToolCreate).toHaveBeenCalledTimes(2);
      expect(mockAgentToolCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toolName: "file_read",
            actionClass: "file_read",
            isActive: true,
          }),
        }),
      );
    });

    it("updates existing tools with new actionClass", async () => {
      mockAgentToolFindFirst.mockResolvedValue({
        id: "tool-uuid-1",
        toolName: "file_read",
        actionClass: "file_write", // old action class
      });

      await registerAgent(makeInput());

      expect(mockAgentToolUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tool-uuid-1" },
          data: expect.objectContaining({
            actionClass: "file_read",
            isActive: true,
            lastSeenAt: expect.any(Date),
          }),
        }),
      );
    });

    it("updates catalogHash", async () => {
      mockAgentToolFindFirst.mockResolvedValue(null);

      await registerAgent(makeInput());

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            catalogHash: "hash_abc123",
          }),
        }),
      );
    });

    it("updates toolsRegisteredCount", async () => {
      mockAgentToolFindFirst.mockResolvedValue(null);

      const result = await registerAgent(makeInput());
      expect(result.tools_registered).toBe(2);
    });

    it("invalidates rule cache", async () => {
      mockAgentToolFindFirst.mockResolvedValue(null);

      await registerAgent(makeInput());

      expect(mockInvalidateAgentRules).toHaveBeenCalledWith(
        "agent-internal-uuid",
      );
    });
  });

  // --- Archived agent ---
  describe("archived agent", () => {
    const archivedAgent = {
      id: "agent-internal-uuid",
      publicId: "agt_archived1",
      accountId: "acct-uuid",
      source: "openclaw",
      externalId: "ext-123",
      name: "archived-agent",
      catalogHash: "hash_abc123",
      toolsRegisteredCount: 2,
      activeRulesCount: 0,
      status: "archived",
    };

    it("reactivates when active count < maxAgents", async () => {
      mockAgentFindFirst.mockResolvedValue(archivedAgent);
      mockAgentCount.mockResolvedValue(1);
      setupAccountLimits(3);
      mockAgentUpdate.mockResolvedValue({
        ...archivedAgent,
        status: "active",
        publicId: "agt_archived1",
        toolsRegisteredCount: 2,
        activeRulesCount: 0,
      });

      const result = await registerAgent(makeInput());

      expect(mockAgentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "active",
          }),
        }),
      );
      expect(result.agent.status).toBe("synced");
    });

    it("rejects reactivation when active count >= maxAgents", async () => {
      mockAgentFindFirst.mockResolvedValue(archivedAgent);
      mockAgentCount.mockResolvedValue(3);
      setupAccountLimits(3);

      await expect(registerAgent(makeInput())).rejects.toThrow(
        "Maximum of 3 active agents per account reached",
      );
    });
  });

  // --- Archived agents don't count toward limit ---
  describe("agent limit counting", () => {
    it("archived agent does not count toward active agent limit", async () => {
      // No existing agent found (new agent flow)
      mockAgentFindFirst.mockResolvedValue(null);
      // Only 2 active agents (not counting archived ones)
      mockAgentCount.mockResolvedValue(2);
      setupAccountLimits(3);
      setupUsagePeriod();
      mockAgentCreate.mockResolvedValue({
        id: "agent-internal-uuid",
        publicId: "agt_testABCD",
        toolsRegisteredCount: 2,
        activeRulesCount: 0,
      });

      // Should succeed since only active agents are counted
      const result = await registerAgent(makeInput());
      expect(result.agent.status).toBe("created");

      // Verify the count query filters by active status
      expect(mockAgentCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: "acct-uuid", status: "active" },
        }),
      );
    });
  });

  // --- Transaction ---
  describe("transaction", () => {
    it("all writes are atomic", async () => {
      mockAgentFindFirst.mockResolvedValue(null);
      mockAgentCount.mockResolvedValue(0);
      setupAccountLimits();
      setupUsagePeriod();
      mockAgentCreate.mockResolvedValue({
        id: "agent-internal-uuid",
        publicId: "agt_testABCD",
        toolsRegisteredCount: 2,
        activeRulesCount: 0,
      });

      await registerAgent(makeInput());

      // Verify $transaction was called
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // All writes should happen inside the transaction callback
      expect(mockAgentCreate).toHaveBeenCalled();
      expect(mockAgentToolCreate).toHaveBeenCalled();
      expect(mockUsagePeriodUpdate).toHaveBeenCalled();
    });
  });
});
