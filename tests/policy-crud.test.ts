import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAccountPolicyEnablementFindFirst = vi.fn();
const mockAccountPolicyEnablementCreate = vi.fn();
const mockAccountPolicyEnablementUpdate = vi.fn();
const mockAccountPolicyEnablementDeleteMany = vi.fn();

const mockRuleFindFirst = vi.fn();
const mockRuleUpdate = vi.fn();
const mockRuleCount = vi.fn();

const mockAgentFindUniqueOrThrow = vi.fn();
const mockAgentUpdate = vi.fn();

const mockTransaction = vi.fn(async (fn: any) =>
  fn({
    accountPolicyEnablement: {
      findFirst: mockAccountPolicyEnablementFindFirst,
      create: mockAccountPolicyEnablementCreate,
      update: mockAccountPolicyEnablementUpdate,
      deleteMany: mockAccountPolicyEnablementDeleteMany,
    },
    rule: {
      update: mockRuleUpdate,
      count: mockRuleCount,
    },
    agent: {
      update: mockAgentUpdate,
    },
  }),
);

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    accountPolicyEnablement: {
      findFirst: mockAccountPolicyEnablementFindFirst,
      create: mockAccountPolicyEnablementCreate,
      update: mockAccountPolicyEnablementUpdate,
      deleteMany: mockAccountPolicyEnablementDeleteMany,
    },
    rule: {
      findFirst: mockRuleFindFirst,
      update: mockRuleUpdate,
      count: mockRuleCount,
    },
    agent: {
      findUniqueOrThrow: mockAgentFindUniqueOrThrow,
      update: mockAgentUpdate,
    },
    $transaction: mockTransaction,
  }),
}));

const mockMaterializeTemplateForAccount = vi.fn();
const mockRemoveTemplateRulesForAccount = vi.fn();

vi.mock("../src/services/policy-materializer.js", () => ({
  materializeTemplateForAccount: (...args: any[]) =>
    mockMaterializeTemplateForAccount(...args),
  removeTemplateRulesForAccount: (...args: any[]) =>
    mockRemoveTemplateRulesForAccount(...args),
}));

const mockCreateRuleAuditEvent = vi.fn();
vi.mock("../src/services/rule-audit.js", () => ({
  createRuleAuditEvent: (...args: any[]) => mockCreateRuleAuditEvent(...args),
}));

const mockInvalidateAgentRules = vi.fn();
vi.mock("../src/services/rule-cache.js", () => ({
  invalidateAgentRules: (...args: any[]) => mockInvalidateAgentRules(...args),
}));

vi.mock("../src/lib/policy-templates.js", () => ({
  POLICY_TEMPLATES: [
    {
      id: "block_shell_execution",
      name: "Block shell execution",
      description: "desc",
      defaultEnabled: true,
      variants: ["bash"],
    },
  ],
  isValidTemplateId: (id: string) => id === "block_shell_execution",
  getTemplate: (id: string) =>
    id === "block_shell_execution"
      ? {
          id: "block_shell_execution",
          name: "Block shell execution",
          description: "desc",
          defaultEnabled: true,
          variants: ["bash"],
        }
      : null,
}));

describe("policy-crud", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAccountPolicyEnablementFindFirst.mockResolvedValue(null);
    mockAccountPolicyEnablementCreate.mockResolvedValue({ id: "en_1" });
    mockAccountPolicyEnablementUpdate.mockResolvedValue({ id: "en_1" });
    mockAccountPolicyEnablementDeleteMany.mockResolvedValue({ count: 1 });

    mockRuleFindFirst.mockResolvedValue(null);
    mockRuleUpdate.mockResolvedValue({});
    mockRuleCount.mockResolvedValue(3);

    mockAgentFindUniqueOrThrow.mockResolvedValue({ publicId: "agt_1" });
    mockAgentUpdate.mockResolvedValue({});

    mockMaterializeTemplateForAccount.mockResolvedValue({
      agentsTouched: 2,
      rulesCreated: 2,
    });
    mockRemoveTemplateRulesForAccount.mockResolvedValue({
      rulesRemoved: 2,
    });
    mockCreateRuleAuditEvent.mockResolvedValue({});
  });

  afterEach(() => {
    // Any test that uses vi.doMock for policy-templates.js leaves the override
    // in place across vi.resetModules(). Explicitly restore the top-level
    // vi.mock shape so subsequent tests see the valid-template definition.
    vi.doUnmock("../src/lib/policy-templates.js");
  });

  it("enablePolicyForAccount rejects unknown template", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/policy-templates.js", () => ({
      POLICY_TEMPLATES: [],
      isValidTemplateId: () => false,
      getTemplate: () => null,
    }));

    const { enablePolicyForAccount } = await import("../src/services/policy-crud.js");

    await expect(
      enablePolicyForAccount({
        accountId: "acct_1",
        templateId: "unknown_template",
        actorUserId: "user_1",
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "not_found" });
  });

  it("enablePolicyForAccount creates enablement and materializes", async () => {
    vi.resetModules();
    const { enablePolicyForAccount } = await import("../src/services/policy-crud.js");

    const result = await enablePolicyForAccount({
      accountId: "acct_1",
      templateId: "block_shell_execution",
      actorUserId: "user_1",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockMaterializeTemplateForAccount).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      template_id: "block_shell_execution",
      enabled: true,
      agents_touched: 2,
      rules_created: 2,
    });
  });

  it("disablePolicyForAccount rejects unknown template", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/policy-templates.js", () => ({
      POLICY_TEMPLATES: [],
      isValidTemplateId: () => false,
      getTemplate: () => null,
    }));

    const { disablePolicyForAccount } = await import("../src/services/policy-crud.js");

    await expect(
      disablePolicyForAccount({
        accountId: "acct_1",
        templateId: "unknown_template",
        actorUserId: "user_1",
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "not_found" });
  });

  it("disablePolicyForAccount deletes enablement and removes rules", async () => {
    vi.resetModules();
    const { disablePolicyForAccount } = await import("../src/services/policy-crud.js");

    const result = await disablePolicyForAccount({
      accountId: "acct_1",
      templateId: "block_shell_execution",
      actorUserId: "user_1",
    });

    expect(mockAccountPolicyEnablementDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockRemoveTemplateRulesForAccount).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      template_id: "block_shell_execution",
      enabled: false,
      rules_removed: 2,
    });
  });

  it("disablePolicyForAccount still removes stale rules when already disabled", async () => {
    vi.resetModules();
    mockAccountPolicyEnablementDeleteMany.mockResolvedValue({ count: 0 });

    const { disablePolicyForAccount } = await import("../src/services/policy-crud.js");

    const result = await disablePolicyForAccount({
      accountId: "acct_1",
      templateId: "block_shell_execution",
      actorUserId: "user_1",
    });

    expect(mockRemoveTemplateRulesForAccount).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      template_id: "block_shell_execution",
      enabled: false,
      rules_removed: 2,
    });
  });

  it("deleteTemplateRule rejects when rule does not exist", async () => {
    vi.resetModules();
    mockRuleFindFirst.mockResolvedValue(null);

    const { deleteTemplateRule } = await import("../src/services/policy-crud.js");

    await expect(
      deleteTemplateRule({
        accountId: "acct_1",
        rulePublicId: "rl_missing",
        actorUserId: "user_1",
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "not_found" });
  });

  it("deleteTemplateRule rejects for user-authored rule", async () => {
    vi.resetModules();
    mockRuleFindFirst.mockResolvedValue({
      id: "r1",
      publicId: "rl_1",
      agentId: "a1",
      type: "block",
      status: "active",
      spec: { tool: "bash" },
      sourceTemplate: null,
      createdAt: new Date(),
      agent: { publicId: "agt_1" },
    });

    const { deleteTemplateRule } = await import("../src/services/policy-crud.js");

    await expect(
      deleteTemplateRule({
        accountId: "acct_1",
        rulePublicId: "rl_1",
        actorUserId: "user_1",
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "validation_error" });
  });

  it("deleteTemplateRule soft-deletes template rule, audits, and updates agent count", async () => {
    vi.resetModules();
    mockRuleFindFirst.mockResolvedValue({
      id: "r1",
      publicId: "rl_1",
      agentId: "a1",
      type: "block",
      status: "active",
      spec: { tool: "bash" },
      sourceTemplate: "block_shell_execution",
      createdAt: new Date("2026-04-21T00:00:00.000Z"),
      agent: { publicId: "agt_1" },
    });

    const { deleteTemplateRule } = await import("../src/services/policy-crud.js");

    const result = await deleteTemplateRule({
      accountId: "acct_1",
      rulePublicId: "rl_1",
      actorUserId: "user_1",
    });

    expect(mockRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockCreateRuleAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockAgentUpdate).toHaveBeenCalledTimes(1);
    expect(mockInvalidateAgentRules).toHaveBeenCalledWith("a1");
    expect(result).toEqual({ rule_id: "rl_1", removed: true });
  });
});
