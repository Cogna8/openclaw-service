import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateRuleId = vi.fn();
vi.mock("../src/lib/ids.js", () => ({
  generateRuleId: () => mockGenerateRuleId(),
}));

const mockBuildNormalizedFingerprint = vi.fn();
vi.mock("../src/lib/rule-normalization.js", () => ({
  buildNormalizedFingerprint: (...args: any[]) =>
    mockBuildNormalizedFingerprint(...args),
}));

vi.mock("../src/lib/policy-templates.js", () => ({
  getTemplate: (id: string) =>
    id === "block_shell_execution"
      ? {
          id: "block_shell_execution",
          variants: ["bash", "sh"],
        }
      : null,
}));

const mockCreateRuleAuditEvent = vi.fn();
vi.mock("../src/services/rule-audit.js", () => ({
  createRuleAuditEvent: (...args: any[]) => mockCreateRuleAuditEvent(...args),
}));

const mockInvalidateAgentRules = vi.fn();
vi.mock("../src/services/rule-cache.js", () => ({
  invalidateAgentRules: (...args: any[]) => mockInvalidateAgentRules(...args),
}));

describe("policy-materializer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateRuleId.mockReturnValue("rl_generated");
    mockBuildNormalizedFingerprint.mockImplementation(
      ({ toolMatch }: any) => `fp:${toolMatch}`,
    );
    mockCreateRuleAuditEvent.mockResolvedValue({});
  });

  it("materializeEnabledPoliciesForAgent returns zero when no enablements", async () => {
    const tx = {
      accountPolicyEnablement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      rule: {
        count: vi.fn(),
      },
      agent: {
        update: vi.fn(),
      },
    };

    const { materializeEnabledPoliciesForAgent } = await import(
      "../src/services/policy-materializer.js"
    );

    const result = await materializeEnabledPoliciesForAgent(tx as any, {
      accountId: "acct_1",
      agentId: "a1",
      agentPublicId: "agt_1",
    });

    expect(result).toEqual({ rulesCreated: 0 });
    expect(mockInvalidateAgentRules).not.toHaveBeenCalled();
  });

  it("materializeEnabledPoliciesForAgent creates rules for template variants", async () => {
    const tx = {
      accountPolicyEnablement: {
        findMany: vi.fn().mockResolvedValue([
          { templateId: "block_shell_execution", enabledByUserId: "user_1" },
        ]),
      },
      rule: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: data.publicId,
            publicId: data.publicId,
            type: data.type,
            status: data.status,
            spec: data.spec,
            sourceTemplate: data.sourceTemplate,
            createdAt: new Date(),
          }),
        ),
        count: vi.fn().mockResolvedValue(2),
      },
      agent: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const { materializeEnabledPoliciesForAgent } = await import(
      "../src/services/policy-materializer.js"
    );

    const result = await materializeEnabledPoliciesForAgent(tx as any, {
      accountId: "acct_1",
      agentId: "a1",
      agentPublicId: "agt_1",
    });

    expect(result).toEqual({ rulesCreated: 2 });
    expect(tx.rule.create).toHaveBeenCalledTimes(2);
    expect(mockCreateRuleAuditEvent).toHaveBeenCalledTimes(2);
    expect(mockInvalidateAgentRules).toHaveBeenCalledWith("a1");
  });

  it("materializeTemplateForAccount returns zero when no active agents", async () => {
    const tx = {
      agent: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      rule: {
        findFirst: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
    };

    const { materializeTemplateForAccount } = await import(
      "../src/services/policy-materializer.js"
    );

    const result = await materializeTemplateForAccount(tx as any, {
      accountId: "acct_1",
      template: { id: "block_shell_execution", variants: ["bash", "sh"] } as any,
      actorUserId: "user_1",
    });

    expect(result).toEqual({ agentsTouched: 0, rulesCreated: 0 });
  });

  it("removeTemplateRulesForAccount returns zero when no matching rules", async () => {
    const tx = {
      rule: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        count: vi.fn(),
      },
      agent: {
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
    };

    const { removeTemplateRulesForAccount } = await import(
      "../src/services/policy-materializer.js"
    );

    const result = await removeTemplateRulesForAccount(tx as any, {
      accountId: "acct_1",
      templateId: "block_shell_execution",
      actorUserId: "user_1",
    });

    expect(result).toEqual({ rulesRemoved: 0 });
    expect(mockCreateRuleAuditEvent).not.toHaveBeenCalled();
  });

  it("removeTemplateRulesForAccount removes matching rules and updates touched agents", async () => {
    const tx = {
      rule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "r1",
            publicId: "rl_1",
            agentId: "a1",
            type: "block",
            status: "active",
            spec: { tool: "bash" },
            sourceTemplate: "block_shell_execution",
            createdAt: new Date(),
          },
          {
            id: "r2",
            publicId: "rl_2",
            agentId: "a2",
            type: "block",
            status: "active",
            spec: { tool: "sh" },
            sourceTemplate: "block_shell_execution",
            createdAt: new Date(),
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      agent: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce({ publicId: "agt_1" })
          .mockResolvedValueOnce({ publicId: "agt_2" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const { removeTemplateRulesForAccount } = await import(
      "../src/services/policy-materializer.js"
    );

    const result = await removeTemplateRulesForAccount(tx as any, {
      accountId: "acct_1",
      templateId: "block_shell_execution",
      actorUserId: "user_1",
    });

    expect(result).toEqual({ rulesRemoved: 2 });
    expect(tx.rule.update).toHaveBeenCalledTimes(2);
    expect(mockCreateRuleAuditEvent).toHaveBeenCalledTimes(2);
    expect(tx.agent.update).toHaveBeenCalledTimes(2);
    expect(mockInvalidateAgentRules).toHaveBeenCalledWith("a1");
    expect(mockInvalidateAgentRules).toHaveBeenCalledWith("a2");
  });
});
