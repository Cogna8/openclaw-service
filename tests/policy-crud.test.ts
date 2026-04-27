import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAccountPolicyEnablementFindFirst = vi.fn();
const mockAccountPolicyEnablementFindMany = vi.fn();
const mockAccountPolicyEnablementCreate = vi.fn();
const mockAccountPolicyEnablementUpdate = vi.fn();
const mockAccountPolicyEnablementDeleteMany = vi.fn();

const mockRuleFindFirst = vi.fn();
const mockRuleFindMany = vi.fn();
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
      findMany: mockAccountPolicyEnablementFindMany,
      create: mockAccountPolicyEnablementCreate,
      update: mockAccountPolicyEnablementUpdate,
      deleteMany: mockAccountPolicyEnablementDeleteMany,
    },
    rule: {
      findFirst: mockRuleFindFirst,
      findMany: mockRuleFindMany,
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
      riskClass: "critical",
      category: "code_execution",
      variants: ["bash"],
    },
  ],
  CRITICAL_DEFAULT_TEMPLATE_IDS: ["block_shell_execution"],
  isValidTemplateId: (id: string) => id === "block_shell_execution",
  getTemplate: (id: string) =>
    id === "block_shell_execution"
      ? {
          id: "block_shell_execution",
          name: "Block shell execution",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "code_execution",
          variants: ["bash"],
        }
      : null,
}));

describe("policy-crud", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAccountPolicyEnablementFindFirst.mockResolvedValue(null);
    mockAccountPolicyEnablementFindMany.mockResolvedValue([]);
    mockAccountPolicyEnablementCreate.mockResolvedValue({ id: "en_1" });
    mockAccountPolicyEnablementUpdate.mockResolvedValue({ id: "en_1" });
    mockAccountPolicyEnablementDeleteMany.mockResolvedValue({ count: 1 });

    mockRuleFindFirst.mockResolvedValue(null);
    mockRuleFindMany.mockResolvedValue([]);
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

  it("applySecureDefaultsForAccount enables every critical template when none enabled", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/policy-templates.js", () => ({
      POLICY_TEMPLATES: [
        {
          id: "block_shell_execution",
          name: "Block shell execution",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "code_execution",
          variants: ["bash"],
        },
        {
          id: "block_file_deletion",
          name: "Block file deletion",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "destructive_ops",
          variants: ["rm"],
        },
        {
          id: "block_code_execution",
          name: "Block code execution",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "code_execution",
          variants: ["python"],
        },
      ],
      CRITICAL_DEFAULT_TEMPLATE_IDS: [
        "block_shell_execution",
        "block_file_deletion",
        "block_code_execution",
      ],
      isValidTemplateId: (id: string) =>
        [
          "block_shell_execution",
          "block_file_deletion",
          "block_code_execution",
        ].includes(id),
      getTemplate: (id: string) => ({
        id,
        name: id,
        description: "desc",
        defaultEnabled: true,
        riskClass: "critical",
        category: "code_execution",
        variants: ["bash"],
      }),
    }));

    mockAccountPolicyEnablementFindMany.mockResolvedValue([]);
    mockRuleFindMany.mockResolvedValue([
      { agentId: "agent_1" },
      { agentId: "agent_2" },
    ]);
    mockMaterializeTemplateForAccount.mockResolvedValue({
      agentsTouched: 2,
      rulesCreated: 2,
    });

    const { applySecureDefaultsForAccount } = await import(
      "../src/services/policy-crud.js"
    );

    const result = await applySecureDefaultsForAccount({
      accountId: "acct_1",
      actorUserId: "user_1",
    });

    expect(mockMaterializeTemplateForAccount).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      enabled_template_ids: [
        "block_shell_execution",
        "block_file_deletion",
        "block_code_execution",
      ],
      already_enabled_template_ids: [],
      // 3 templates × 2 rules each from the materializer mock
      rules_created: 6,
      agents_touched: 2,
    });
  });

  it("applySecureDefaultsForAccount is idempotent when all critical templates already enabled", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/policy-templates.js", () => ({
      POLICY_TEMPLATES: [
        {
          id: "block_shell_execution",
          name: "Block shell execution",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "code_execution",
          variants: ["bash"],
        },
        {
          id: "block_file_deletion",
          name: "Block file deletion",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "destructive_ops",
          variants: ["rm"],
        },
        {
          id: "block_code_execution",
          name: "Block code execution",
          description: "desc",
          defaultEnabled: true,
          riskClass: "critical",
          category: "code_execution",
          variants: ["python"],
        },
      ],
      CRITICAL_DEFAULT_TEMPLATE_IDS: [
        "block_shell_execution",
        "block_file_deletion",
        "block_code_execution",
      ],
      isValidTemplateId: (id: string) =>
        [
          "block_shell_execution",
          "block_file_deletion",
          "block_code_execution",
        ].includes(id),
      getTemplate: (id: string) => ({
        id,
        name: id,
        description: "desc",
        defaultEnabled: true,
        riskClass: "critical",
        category: "code_execution",
        variants: ["bash"],
      }),
    }));

    mockAccountPolicyEnablementFindMany.mockResolvedValue([
      { templateId: "block_shell_execution" },
      { templateId: "block_file_deletion" },
      { templateId: "block_code_execution" },
    ]);
    // Re-enable goes through enablePolicyForAccount which finds the existing
    // enablement and updates it instead of inserting; the materializer reports
    // 0 rules created because all variants are already materialized.
    mockMaterializeTemplateForAccount.mockResolvedValue({
      agentsTouched: 0,
      rulesCreated: 0,
    });
    mockAccountPolicyEnablementFindFirst.mockResolvedValue({ id: "en_1" });
    mockRuleFindMany.mockResolvedValue([{ agentId: "agent_1" }]);

    const { applySecureDefaultsForAccount } = await import(
      "../src/services/policy-crud.js"
    );

    const result = await applySecureDefaultsForAccount({
      accountId: "acct_1",
      actorUserId: "user_1",
    });

    expect(result).toEqual({
      enabled_template_ids: [],
      already_enabled_template_ids: [
        "block_shell_execution",
        "block_file_deletion",
        "block_code_execution",
      ],
      rules_created: 0,
      agents_touched: 1,
    });
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
