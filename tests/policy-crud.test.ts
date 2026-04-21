import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTx = {
  accountPolicyEnablement: {
    findFirst: mockFindFirst,
    create: mockCreate,
    update: mockUpdate,
  },
};

const mockTransaction = vi.fn(async (fn: any) => fn(mockTx));

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({ $transaction: mockTransaction }),
}));

vi.mock("../src/lib/policy-templates.js", () => ({
  POLICY_TEMPLATES: [],
  TEMPLATE_IDS: ["block_shell_execution"],
  isValidTemplateId: () => true,
  getTemplate: () => ({ id: "block_shell_execution", variants: ["bash"] }),
}));

const mockMaterialize = vi.fn();
vi.mock("../src/services/policy-materializer.js", () => ({
  materializeTemplateForAccount: (...args: any[]) => mockMaterialize(...args),
  removeTemplateRulesForAccount: vi.fn(),
}));

describe("enablePolicyForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "e1" });
    mockMaterialize.mockResolvedValue({ agentsTouched: 2, rulesCreated: 2 });
  });

  it("creates enablement and materializes rules atomically", async () => {
    const { enablePolicyForAccount } = await import("../src/services/policy-crud.js");

    const result = await enablePolicyForAccount({
      accountId: "acct_1",
      templateId: "block_shell_execution",
      actorUserId: "user_1",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalled();
    expect(mockMaterialize).toHaveBeenCalled();
    expect(result).toEqual({
      template_id: "block_shell_execution",
      enabled: true,
      agents_touched: 2,
      rules_created: 2,
    });
  });
});
