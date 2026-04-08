import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockAgentFindFirst = vi.fn();
const mockAgentUpdate = vi.fn().mockResolvedValue({});
const mockAgentToolFindFirst = vi.fn();
const mockRuleFindMany = vi.fn();
const mockUsagePeriodFindFirst = vi.fn();
const mockUsagePeriodUpsert = vi.fn();
const mockUsagePeriodUpdate = vi.fn();
const mockAccountFindUniqueOrThrow = vi.fn();
const mockEvaluationEventCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    agent: { findFirst: mockAgentFindFirst, update: mockAgentUpdate },
    agentTool: { findFirst: mockAgentToolFindFirst },
    rule: { findMany: mockRuleFindMany },
    usagePeriod: {
      findFirst: mockUsagePeriodFindFirst,
      upsert: mockUsagePeriodUpsert,
      update: mockUsagePeriodUpdate,
    },
    account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
    evaluationEvent: { create: mockEvaluationEventCreate },
    $transaction: mockTransaction,
  }),
}));

vi.mock("../src/lib/ids.js", () => ({
  generateEvaluationId: vi.fn().mockReturnValue("ev_test123"),
}));

import { evaluateHotPath, type EvaluateInput } from "../src/services/evaluate.js";
import { invalidateAgentRules } from "../src/services/rule-cache.js";

function makeInput(overrides: Partial<EvaluateInput["body"]> = {}): EvaluateInput {
  return {
    accountId: "acct-uuid",
    apiKeyId: "key-uuid",
    body: {
      agent_id: "agt_test123",
      session: { id: "sess-1" },
      tool_call: {
        tool_name: "file_read",
      },
      ...overrides,
    },
  };
}

function setupAgent(overrides: Record<string, unknown> = {}) {
  mockAgentFindFirst.mockResolvedValue({
    id: "agent-uuid",
    publicId: "agt_test123",
    accountId: "acct-uuid",
    catalogHash: "abc123",
    status: "active",
    ...overrides,
  });
}

function setupNoRules() {
  mockRuleFindMany.mockResolvedValue([]);
}

function setupUsage(evaluationsUsed = 5, limit = 10000) {
  // These mocks are used inside the $transaction callback
  mockUsagePeriodFindFirst.mockResolvedValue({
    id: "period-uuid",
    evaluationsUsed,
  });
  mockAccountFindUniqueOrThrow.mockResolvedValue({
    evaluationsLimitMonthly: limit,
  });
  mockUsagePeriodUpdate.mockResolvedValue({});
  mockEvaluationEventCreate.mockResolvedValue({});
}

function setupTransaction() {
  mockTransaction.mockImplementation(async (fn: Function) => {
    // Pass the mock DB as the transaction client
    const txClient = {
      usagePeriod: {
        findFirst: mockUsagePeriodFindFirst,
        upsert: mockUsagePeriodUpsert,
        update: mockUsagePeriodUpdate,
      },
      account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
      evaluationEvent: { create: mockEvaluationEventCreate },
    };
    return fn(txClient);
  });
}

describe("evaluateHotPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAgentRules("agent-uuid");
    setupTransaction();
  });

  it("no rules -> allow", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    setupNoRules();
    setupUsage();

    const result = await evaluateHotPath(makeInput());

    expect(result.decision).toBe("allow");
    expect(result.rule).toBeNull();
    expect(result.reason_code).toBeNull();
    expect(result.message).toBeNull();
    expect(result.mode).toBe("normal");
  });

  it("protect rule match -> block", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_protect1",
        type: "protect",
        toolMatch: null,
        targetKind: "path",
        targetValueNormalized: "/home/user/.ssh/*",
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: {
          tool_name: "file_read",
          targets: { path: "/home/user/.ssh/id_rsa" },
        },
      }),
    );

    expect(result.decision).toBe("block");
    expect(result.rule).toEqual({ id: "rl_protect1", type: "protect" });
    expect(result.reason_code).toBe("protected_target");
  });

  it("block rule match -> block", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue({ actionClass: "exec" });
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_block1",
        type: "block",
        toolMatch: "exec",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: { tool_name: "run_command" },
      }),
    );

    expect(result.decision).toBe("block");
    expect(result.rule).toEqual({ id: "rl_block1", type: "block" });
    expect(result.reason_code).toBe("blocked_tool");
  });

  it("threshold rule match -> block", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue({ actionClass: "file_delete" });
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_thresh1",
        type: "threshold",
        toolMatch: "file_delete",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: 10,
        thresholdPeriod: "session",
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: {
          tool_name: "rm",
          action_class: "file_delete",
          scope: { count_in_session: 10 },
        },
      }),
    );

    expect(result.decision).toBe("block");
    expect(result.rule).toEqual({ id: "rl_thresh1", type: "threshold" });
    expect(result.reason_code).toBe("threshold_exceeded");
  });

  it("exclude rule match -> block", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue({ actionClass: "email_archive" });
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_excl1",
        type: "exclude",
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValueNormalized: "sarah@example.com",
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: {
          tool_name: "archive_email",
          targets: { sender: "Sarah@Example.com" },
        },
      }),
    );

    expect(result.decision).toBe("block");
    expect(result.rule).toEqual({ id: "rl_excl1", type: "exclude" });
    expect(result.reason_code).toBe("excluded_target");
  });

  it("confirm rule match -> block with confirmation_required", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue({ actionClass: "file_delete" });
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_confirm1",
        type: "confirm",
        toolMatch: "file_delete",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: { tool_name: "delete_file" },
      }),
    );

    expect(result.decision).toBe("block");
    expect(result.rule).toEqual({ id: "rl_confirm1", type: "confirm" });
    expect(result.reason_code).toBe("confirmation_required");
  });

  it("action class resolved from tool catalog when not in body", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue({ actionClass: "exec" });
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_block1",
        type: "block",
        toolMatch: "exec",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: { tool_name: "run_shell" },
      }),
    );

    expect(mockAgentToolFindFirst).toHaveBeenCalledWith({
      where: { agentId: "agent-uuid", toolName: "run_shell", isActive: true },
      select: { actionClass: true },
    });
    expect(result.decision).toBe("block");
  });

  it("unknown tool (not in catalog) still matches exact tool-name block rule", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_block1",
        type: "block",
        toolMatch: "dangerous_tool",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({
        tool_call: { tool_name: "dangerous_tool" },
      }),
    );

    expect(result.decision).toBe("block");
  });

  it("unknown agent -> 404", async () => {
    mockAgentFindFirst.mockResolvedValue(null);

    await expect(evaluateHotPath(makeInput())).rejects.toThrow("Agent not found");
  });

  it("wrong-account agent -> 404", async () => {
    mockAgentFindFirst.mockResolvedValue({
      id: "agent-uuid",
      publicId: "agt_test123",
      accountId: "other-acct-uuid",
      catalogHash: "abc123",
      status: "active",
    });

    await expect(evaluateHotPath(makeInput())).rejects.toThrow("Agent not found");
  });

  it("archived agent -> 404", async () => {
    setupAgent({ status: "archived" });

    await expect(evaluateHotPath(makeInput())).rejects.toThrow("Agent not found");
  });

  it("mode switches to degraded after cap", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    setupNoRules();
    setupUsage(9999, 10000); // next eval will hit cap

    const result = await evaluateHotPath(makeInput());

    expect(result.mode).toBe("degraded");
  });

  it("degraded allow -> stored false, id null", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    setupNoRules();
    setupUsage(9999, 10000);

    const result = await evaluateHotPath(makeInput());

    expect(result.decision).toBe("allow");
    expect(result.mode).toBe("degraded");
    expect(result.evaluation.stored).toBe(false);
    expect(result.evaluation.id).toBeNull();
  });

  it("degraded block -> stored true", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_block1",
        type: "block",
        toolMatch: "file_read",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage(9999, 10000);

    const result = await evaluateHotPath(
      makeInput({
        tool_call: { tool_name: "file_read" },
      }),
    );

    expect(result.decision).toBe("block");
    expect(result.mode).toBe("degraded");
    expect(result.evaluation.stored).toBe(true);
    expect(result.evaluation.id).toBe("ev_test123");
  });

  it("response shape matches locked contract for allow", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    setupNoRules();
    setupUsage();

    const result = await evaluateHotPath(makeInput());

    expect(result).toHaveProperty("decision");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("rule");
    expect(result).toHaveProperty("reason_code");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("evaluation");
    expect(result.evaluation).toHaveProperty("id");
    expect(result.evaluation).toHaveProperty("stored");
    expect(["allow", "block"]).toContain(result.decision);
    expect(["normal", "degraded"]).toContain(result.mode);
  });

  it("response shape matches locked contract for block", async () => {
    setupAgent();
    mockAgentToolFindFirst.mockResolvedValue(null);
    mockRuleFindMany.mockResolvedValue([
      {
        id: "rule-uuid",
        publicId: "rl_block1",
        type: "block",
        toolMatch: "file_read",
        targetKind: null,
        targetValueNormalized: null,
        thresholdMax: null,
        thresholdPeriod: null,
      },
    ]);
    setupUsage();

    const result = await evaluateHotPath(
      makeInput({ tool_call: { tool_name: "file_read" } }),
    );

    expect(result.decision).toBe("block");
    expect(result.rule).not.toBeNull();
    expect(result.rule!.id).toBe("rl_block1");
    expect(result.rule!.type).toBe("block");
    expect(result.reason_code).toBe("blocked_tool");
    expect(result.message).toBeTruthy();
    expect(result.evaluation.stored).toBe(true);
    expect(result.evaluation.id).toBe("ev_test123");
  });
});
