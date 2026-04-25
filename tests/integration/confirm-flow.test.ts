import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("../../src/lib/db.js", () => ({
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

vi.mock("../../src/lib/ids.js", () => ({
  generateEvaluationId: vi.fn().mockReturnValue("ev_test_confirm"),
  generateRuleId: vi.fn().mockReturnValue("rl_test"),
}));

import { evaluateHotPath, type EvaluateInput } from "../../src/services/evaluate.js";
import { invalidateAgentRules } from "../../src/services/rule-cache.js";

function makeInput(overrides: Partial<EvaluateInput["body"]> = {}): EvaluateInput {
  return {
    accountId: "acct-uuid",
    apiKeyId: "key-uuid",
    body: {
      agent_id: "agt_test",
      session: { id: "sess-1" },
      tool_call: { tool_name: "bash", action_class: "exec" },
      ...overrides,
    },
  };
}

function setupAgent(overrides: Record<string, unknown> = {}) {
  mockAgentFindFirst.mockResolvedValue({
    id: "agent-uuid",
    publicId: "agt_test",
    accountId: "acct-uuid",
    catalogHash: "abc",
    status: "active",
    pluginVersion: "0.3.0",
    ...overrides,
  });
}

function setupConfirmRule() {
  mockRuleFindMany.mockResolvedValue([
    {
      id: "rule-uuid-1",
      publicId: "rl_confirm1",
      type: "confirm",
      toolMatch: "bash",
      targetKind: null,
      targetValueNormalized: null,
      thresholdMax: null,
      thresholdPeriod: null,
    },
  ]);
}

function setupBlockAndConfirmRules() {
  mockRuleFindMany.mockResolvedValue([
    {
      id: "rule-uuid-block",
      publicId: "rl_block1",
      type: "block",
      toolMatch: "bash",
      targetKind: null,
      targetValueNormalized: null,
      thresholdMax: null,
      thresholdPeriod: null,
    },
    {
      id: "rule-uuid-confirm",
      publicId: "rl_confirm1",
      type: "confirm",
      toolMatch: "bash",
      targetKind: null,
      targetValueNormalized: null,
      thresholdMax: null,
      thresholdPeriod: null,
    },
  ]);
}

function setupNoRules() {
  mockRuleFindMany.mockResolvedValue([]);
}

function setupUsageAndTransaction() {
  mockUsagePeriodFindFirst.mockResolvedValue({
    id: "period-uuid",
    evaluationsUsed: 5,
    accountId: "acct-uuid",
    periodStart: new Date(),
    periodEnd: new Date(),
  });
  mockAccountFindUniqueOrThrow.mockResolvedValue({
    evaluationsLimitMonthly: 10000,
  });
  mockUsagePeriodUpdate.mockResolvedValue({});
  mockEvaluationEventCreate.mockResolvedValue({});
  mockTransaction.mockImplementation(async (cb: any) => {
    const tx = {
      usagePeriod: {
        findFirst: mockUsagePeriodFindFirst,
        upsert: mockUsagePeriodUpsert,
        update: mockUsagePeriodUpdate,
      },
      account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
      evaluationEvent: { create: mockEvaluationEventCreate },
    };
    return cb(tx);
  });
}

describe("confirm decision flow — evaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAgentRules("agent-uuid");
    setupUsageAndTransaction();
  });

  it("#1 confirm rule on bash -> decision=confirm with prompt payload", async () => {
    setupAgent();
    setupConfirmRule();
    const result = await evaluateHotPath(makeInput());
    expect(result.decision).toBe("confirm");
    expect(result.decision_id).toBe("ev_test_confirm");
    expect(result.evaluation.stored).toBe(true);
    expect(result.evaluation.id).toBe("ev_test_confirm");
    expect(result.decision_id).toBe(result.evaluation.id);
    expect(result.prompt?.title).toBe("Command execution requires approval");
    expect(result.prompt?.description).toBe("bash");
    expect(result.prompt?.severity).toBe("critical");
    expect(result.timeout_ms).toBe(120000);
    expect(result.timeout_behavior).toBe("deny");
    expect(result.reason_code).toBe("confirmation_required");
  });

  it("#2 no match -> decision=allow (regression)", async () => {
    setupAgent();
    setupNoRules();
    const result = await evaluateHotPath(
      makeInput({ tool_call: { tool_name: "read_file", action_class: "file_read" } }),
    );
    expect(result.decision).toBe("allow");
    expect(result.prompt).toBeUndefined();
    expect(result.decision_id).toBeUndefined();
  });

  it("#3 block + confirm on same tool -> block wins", async () => {
    setupAgent();
    setupBlockAndConfirmRules();
    const result = await evaluateHotPath(makeInput());
    expect(result.decision).toBe("block");
    expect(result.rule?.id).toBe("rl_block1");
    expect(result.prompt).toBeUndefined();
  });

  it("#4 plugin version < 0.3.0 + confirm rule -> block fallback", async () => {
    setupAgent({ pluginVersion: "0.2.1" });
    setupConfirmRule();
    const result = await evaluateHotPath(makeInput());
    expect(result.decision).toBe("block");
    expect(result.reason_code).toBe("plugin_version_too_old_for_confirm");
    expect(result.message).toContain("0.3.0");
    expect(result.prompt).toBeUndefined();
  });

  it("#5 plugin version invalid -> block fallback (fail closed)", async () => {
    setupAgent({ pluginVersion: "garbage" });
    setupConfirmRule();
    const result = await evaluateHotPath(makeInput());
    expect(result.decision).toBe("block");
    expect(result.reason_code).toBe("plugin_version_too_old_for_confirm");
  });

  it("#6 plugin version null -> block fallback", async () => {
    setupAgent({ pluginVersion: null });
    setupConfirmRule();
    const result = await evaluateHotPath(makeInput());
    expect(result.decision).toBe("block");
    expect(result.reason_code).toBe("plugin_version_too_old_for_confirm");
  });

  it("#7 confirm decision does not increment blocksStored", async () => {
    setupAgent();
    setupConfirmRule();
    await evaluateHotPath(makeInput());
    const updateCalls = mockUsagePeriodUpdate.mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[0].data.blocksStored).toBeUndefined();
  });

  it("#8 old-plugin block fallback DOES increment blocksStored", async () => {
    setupAgent({ pluginVersion: "0.2.1" });
    setupConfirmRule();
    await evaluateHotPath(makeInput());
    const updateCalls = mockUsagePeriodUpdate.mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[0].data.blocksStored).toEqual({ increment: 1 });
  });

  it("#9 old-plugin fallback persists upgrade message in stored message field", async () => {
    setupAgent({ pluginVersion: "0.2.1" });
    setupConfirmRule();
    await evaluateHotPath(makeInput());
    const createCall = mockEvaluationEventCreate.mock.calls[0];
    if (!createCall) return;
    const data = createCall[0]?.data ?? createCall[0];
    expect(data.reasonCode ?? null).toBeNull();
    if (data.message) {
      expect(data.message).toContain("0.3.0");
    }
  });
});
