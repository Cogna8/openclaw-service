import { describe, it, expect, vi, beforeEach } from "vitest";

// --- DB mocks ---
const mockAccountFindUniqueOrThrow = vi.fn();
const mockUsagePeriodFindFirst = vi.fn();
const mockAgentFindMany = vi.fn();
const mockEvaluationEventFindMany = vi.fn();
const mockEvaluationEventGroupBy = vi.fn();

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    account: { findUniqueOrThrow: mockAccountFindUniqueOrThrow },
    usagePeriod: { findFirst: mockUsagePeriodFindFirst },
    agent: { findMany: mockAgentFindMany },
    evaluationEvent: {
      findMany: mockEvaluationEventFindMany,
      groupBy: mockEvaluationEventGroupBy,
    },
  }),
}));

import { getAccountStatus } from "../src/services/account-status.js";

describe("account-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDefaults() {
    mockAccountFindUniqueOrThrow.mockResolvedValue({
      plan: "free",
      evaluationsLimitMonthly: 10000,
    });
    mockUsagePeriodFindFirst.mockResolvedValue({
      evaluationsUsed: 4231,
      mode: "normal",
    });
    mockAgentFindMany.mockResolvedValue([]);
    mockEvaluationEventFindMany.mockResolvedValue([]);
    mockEvaluationEventGroupBy.mockResolvedValue([]);
  }

  it("returns correct account plan and limits", async () => {
    setupDefaults();

    const result = await getAccountStatus("acct-uuid");

    expect(result.account.plan).toBe("free");
    expect(result.account.evaluations_limit).toBe(10000);
  });

  it("returns current usage period data", async () => {
    setupDefaults();

    const result = await getAccountStatus("acct-uuid");

    expect(result.account.evaluations_used).toBe(4231);
    expect(result.account.mode).toBe("normal");
  });

  it("returns 'normal' mode and 0 evaluationsUsed when no usage period exists", async () => {
    mockAccountFindUniqueOrThrow.mockResolvedValue({
      plan: "free",
      evaluationsLimitMonthly: 10000,
    });
    mockUsagePeriodFindFirst.mockResolvedValue(null);
    mockAgentFindMany.mockResolvedValue([]);
    mockEvaluationEventFindMany.mockResolvedValue([]);
    mockEvaluationEventGroupBy.mockResolvedValue([]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.account.evaluations_used).toBe(0);
    expect(result.account.mode).toBe("normal");
  });

  it("approvals aggregate is zero when no confirm events", async () => {
    setupDefaults();

    const result = await getAccountStatus("acct-uuid");

    expect(result.approvals).toEqual({
      requested: 0,
      resolved_allow: 0,
      resolved_deny: 0,
      resolved_timeout: 0,
      unresolved: 0,
    });
  });

  it("approvals aggregate sums resolution buckets correctly", async () => {
    setupDefaults();
    mockEvaluationEventGroupBy.mockResolvedValue([
      { resolution: "allow_once", _count: { _all: 3 } },
      { resolution: "allow_always", _count: { _all: 2 } },
      { resolution: "deny", _count: { _all: 4 } },
      { resolution: "cancelled", _count: { _all: 1 } },
      { resolution: "timeout", _count: { _all: 5 } },
      { resolution: null, _count: { _all: 7 } },
    ]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.approvals).toEqual({
      requested: 22,
      resolved_allow: 5,
      resolved_deny: 5,
      resolved_timeout: 5,
      unresolved: 7,
    });
  });

  it("period boundaries are computed timestamps, not raw DB dates", async () => {
    setupDefaults();

    const result = await getAccountStatus("acct-uuid");

    // period_start should be first day of current month at 00:00:00.000Z
    const start = new Date(result.account.period_start);
    expect(start.getUTCDate()).toBe(1);
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);

    // period_end should be last millisecond of current month
    const end = new Date(result.account.period_end);
    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);

    // period_end should be in the same month as period_start
    expect(end.getUTCMonth()).toBe(start.getUTCMonth());
  });

  it("lists active agents only (not archived)", async () => {
    setupDefaults();
    mockAgentFindMany.mockResolvedValue([
      {
        publicId: "agt_test123",
        name: "test-agent:main",
        toolsRegisteredCount: 15,
        activeRulesCount: 3,
        lastSeenAt: new Date("2026-04-08T14:25:00.000Z"),
      },
    ]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].id).toBe("agt_test123");
    expect(result.agents[0].name).toBe("test-agent:main");
    expect(result.agents[0].tools_registered).toBe(15);
    expect(result.agents[0].active_rules).toBe(3);

    // Verify query filters by active status
    expect(mockAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: "acct-uuid", status: "active" },
      }),
    );
  });

  it("agents ordered by lastSeenAt desc", async () => {
    setupDefaults();
    mockAgentFindMany.mockResolvedValue([
      {
        publicId: "agt_newer",
        name: "newer-agent",
        toolsRegisteredCount: 5,
        activeRulesCount: 1,
        lastSeenAt: new Date("2026-04-08T16:00:00.000Z"),
      },
      {
        publicId: "agt_older",
        name: "older-agent",
        toolsRegisteredCount: 3,
        activeRulesCount: 0,
        lastSeenAt: new Date("2026-04-07T10:00:00.000Z"),
      },
    ]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.agents[0].id).toBe("agt_newer");
    expect(result.agents[1].id).toBe("agt_older");

    // Verify ordering
    expect(mockAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { lastSeenAt: "desc" },
      }),
    );
  });

  it("returns last 10 block events", async () => {
    setupDefaults();
    const events = Array.from({ length: 10 }, (_, i) => ({
      toolName: `tool_${i}`,
      reasonCode: "blocked_tool",
      message: `Blocked tool_${i}`,
      createdAt: new Date(`2026-04-08T${String(14 - i).padStart(2, "0")}:00:00.000Z`),
      matchedRule: { publicId: `rl_rule${i}` },
    }));
    mockEvaluationEventFindMany.mockResolvedValue(events);

    const result = await getAccountStatus("acct-uuid");

    expect(result.recent_events).toHaveLength(10);
    expect(result.recent_events[0].type).toBe("block");
    expect(result.recent_events[0].tool_name).toBe("tool_0");
    expect(result.recent_events[0].rule_id).toBe("rl_rule0");

    // Verify take: 10
    expect(mockEvaluationEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
      }),
    );
  });

  it("block events ordered by createdAt desc", async () => {
    setupDefaults();

    await getAccountStatus("acct-uuid");

    expect(mockEvaluationEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("block events include rule_id from matched rule publicId", async () => {
    setupDefaults();
    mockEvaluationEventFindMany.mockResolvedValue([
      {
        toolName: "file_delete",
        reasonCode: "protected_target",
        message: "Path /home/user/.ssh/* is protected",
        createdAt: new Date("2026-04-08T14:22:00.000Z"),
        matchedRule: { publicId: "rl_7K2M4x9p" },
      },
    ]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.recent_events[0].rule_id).toBe("rl_7K2M4x9p");
    expect(result.recent_events[0].reason_code).toBe("protected_target");
    expect(result.recent_events[0].message).toBe(
      "Path /home/user/.ssh/* is protected",
    );
  });

  it("block events show null rule_id when matched rule was deleted", async () => {
    setupDefaults();
    mockEvaluationEventFindMany.mockResolvedValue([
      {
        toolName: "exec",
        reasonCode: "blocked_tool",
        message: "Tool is blocked",
        createdAt: new Date("2026-04-08T12:00:00.000Z"),
        matchedRule: null,
      },
    ]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.recent_events[0].rule_id).toBeNull();
  });

  it("returns empty agents array when no agents", async () => {
    setupDefaults();
    mockAgentFindMany.mockResolvedValue([]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.agents).toEqual([]);
  });

  it("returns empty recent_events when no blocks", async () => {
    setupDefaults();
    mockEvaluationEventFindMany.mockResolvedValue([]);

    const result = await getAccountStatus("acct-uuid");

    expect(result.recent_events).toEqual([]);
  });
});
