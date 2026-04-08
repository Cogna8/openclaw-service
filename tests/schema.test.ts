import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { generateAccountId, generateApiKeyId, generateAgentId, generateRuleId, generateEvaluationId } from "../src/lib/ids.js";
import { generateRawApiKey, hashApiKey } from "../src/lib/api-key-utils.js";
import { buildNormalizedFingerprint } from "../src/lib/rule-normalization.js";
import { createPrismaClient } from "../src/lib/prisma.js";

const prisma = createPrismaClient();

// Track created account IDs for cleanup
const createdAccountIds: string[] = [];

function makeAccountId() {
  const id = randomUUID();
  createdAccountIds.push(id);
  return id;
}

beforeAll(async () => {
  // Verify connection
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  // Clean up test data (cascade will handle children)
  if (createdAccountIds.length > 0) {
    await prisma.account.deleteMany({
      where: { id: { in: createdAccountIds } },
    });
  }
  await prisma.$disconnect();
});

describe("Schema builds cleanly", () => {
  it("can query each table without error", async () => {
    await expect(prisma.account.findFirst()).resolves.not.toThrow();
    await expect(prisma.apiKey.findFirst()).resolves.not.toThrow();
    await expect(prisma.agent.findFirst()).resolves.not.toThrow();
    await expect(prisma.agentTool.findFirst()).resolves.not.toThrow();
    await expect(prisma.rule.findFirst()).resolves.not.toThrow();
    await expect(prisma.ruleAuditEvent.findFirst()).resolves.not.toThrow();
    await expect(prisma.usagePeriod.findFirst()).resolves.not.toThrow();
    await expect(prisma.evaluationEvent.findFirst()).resolves.not.toThrow();
  });
});

describe("Account and API key basics", () => {
  it("can create account with default limits", async () => {
    const id = makeAccountId();
    const account = await prisma.account.create({
      data: { id, publicId: generateAccountId() },
    });
    expect(account.plan).toBe("free");
    expect(account.status).toBe("active");
    expect(account.evaluationsLimitMonthly).toBe(10000);
    expect(account.maxAgents).toBe(3);
    expect(account.maxRulesPerAgent).toBe(25);
    expect(account.postCapNewRulesLimit).toBe(3);
    expect(account.apiVersion).toBe("v1");
  });

  it("can create API key linked to account", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const raw = generateRawApiKey();
    const hashed = hashApiKey(raw);
    const apiKey = await prisma.apiKey.create({
      data: {
        publicId: generateApiKeyId(),
        accountId,
        label: "Test Key",
        ...hashed,
      },
    });
    expect(apiKey.secretPrefix).toBe("cg8_sk_");
    expect(apiKey.status).toBe("active");
  });

  it("publicId constraint rejects invalid format", async () => {
    const id = makeAccountId();
    await expect(
      prisma.account.create({
        data: { id, publicId: "bad_prefix_123" },
      }),
    ).rejects.toThrow();
    // Remove from tracking since it wasn't created
    createdAccountIds.pop();
  });

  it("lookupHash unique constraint works", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const raw = generateRawApiKey();
    const hashed = hashApiKey(raw);
    await prisma.apiKey.create({
      data: {
        publicId: generateApiKeyId(),
        accountId,
        label: "Key 1",
        ...hashed,
      },
    });
    await expect(
      prisma.apiKey.create({
        data: {
          publicId: generateApiKeyId(),
          accountId,
          label: "Key 2",
          ...hashed, // same lookupHash
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Agent uniqueness", () => {
  it("same account + source + externalId cannot create duplicate", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "agent-1",
        name: "Test Agent",
        catalogHash: "abc123",
      },
    });
    await expect(
      prisma.agent.create({
        data: {
          publicId: generateAgentId(),
          accountId,
          externalId: "agent-1",
          name: "Duplicate Agent",
          catalogHash: "def456",
        },
      }),
    ).rejects.toThrow();
  });

  it("archived status is supported", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "agent-arch",
        name: "Agent to Archive",
        catalogHash: "abc",
      },
    });
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: { status: "archived" },
    });
    expect(updated.status).toBe("archived");
  });
});

describe("Agent tool uniqueness", () => {
  it("same agent cannot register duplicate toolName case-insensitively", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "tool-test-agent",
        name: "Tool Test",
        catalogHash: "abc",
      },
    });
    await prisma.agentTool.create({
      data: { agentId: agent.id, toolName: "readFile" },
    });
    await expect(
      prisma.agentTool.create({
        data: { agentId: agent.id, toolName: "READFILE" },
      }),
    ).rejects.toThrow();
  });

  it("different agents can have the same toolName", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent1 = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "agent-a",
        name: "Agent A",
        catalogHash: "h1",
      },
    });
    const agent2 = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "agent-b",
        name: "Agent B",
        catalogHash: "h2",
      },
    });
    await prisma.agentTool.create({
      data: { agentId: agent1.id, toolName: "sharedTool" },
    });
    await expect(
      prisma.agentTool.create({
        data: { agentId: agent2.id, toolName: "sharedTool" },
      }),
    ).resolves.toBeDefined();
  });
});

describe("Rule deduplication", () => {
  let accountId: string;
  let agentId: string;
  let agent2Id: string;

  beforeAll(async () => {
    accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "rule-test-agent",
        name: "Rule Test",
        catalogHash: "abc",
      },
    });
    agentId = agent.id;
    const agent2 = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "rule-test-agent-2",
        name: "Rule Test 2",
        catalogHash: "def",
      },
    });
    agent2Id = agent2.id;
  });

  it("same agent + same fingerprint cannot create duplicate non-removed rule", async () => {
    const fp = buildNormalizedFingerprint({ type: "block", toolMatch: "exec" });
    await prisma.rule.create({
      data: {
        publicId: generateRuleId(),
        accountId,
        agentId,
        type: "block",
        spec: { type: "block", tool: "exec" },
        normalizedFingerprint: fp,
        toolMatch: "exec",
      },
    });
    await expect(
      prisma.rule.create({
        data: {
          publicId: generateRuleId(),
          accountId,
          agentId,
          type: "block",
          spec: { type: "block", tool: "exec" },
          normalizedFingerprint: fp,
          toolMatch: "exec",
        },
      }),
    ).rejects.toThrow();
  });

  it("removed rule no longer blocks recreation of same fingerprint", async () => {
    const fp = buildNormalizedFingerprint({ type: "confirm", toolMatch: "file_delete" });
    const rule = await prisma.rule.create({
      data: {
        publicId: generateRuleId(),
        accountId,
        agentId,
        type: "confirm",
        spec: { type: "confirm", tool: "file_delete" },
        normalizedFingerprint: fp,
        toolMatch: "file_delete",
      },
    });
    // Remove it
    await prisma.rule.update({
      where: { id: rule.id },
      data: { status: "removed", removedAt: new Date() },
    });
    // Recreate with same fingerprint should succeed
    await expect(
      prisma.rule.create({
        data: {
          publicId: generateRuleId(),
          accountId,
          agentId,
          type: "confirm",
          spec: { type: "confirm", tool: "file_delete" },
          normalizedFingerprint: fp,
          toolMatch: "file_delete",
        },
      }),
    ).resolves.toBeDefined();
  });

  it("different agents can have rules with the same fingerprint", async () => {
    const fp = buildNormalizedFingerprint({ type: "block", toolMatch: "browser" });
    await prisma.rule.create({
      data: {
        publicId: generateRuleId(),
        accountId,
        agentId,
        type: "block",
        spec: { type: "block", tool: "browser" },
        normalizedFingerprint: fp,
        toolMatch: "browser",
      },
    });
    await expect(
      prisma.rule.create({
        data: {
          publicId: generateRuleId(),
          accountId,
          agentId: agent2Id,
          type: "block",
          spec: { type: "block", tool: "browser" },
          normalizedFingerprint: fp,
          toolMatch: "browser",
        },
      }),
    ).resolves.toBeDefined();
  });
});

describe("Rule status consistency (DB level)", () => {
  let accountId: string;
  let agentId: string;

  beforeAll(async () => {
    accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "status-test",
        name: "Status Test",
        catalogHash: "abc",
      },
    });
    agentId = agent.id;
  });

  it("disabling a rule sets disabledAt", async () => {
    const fp = buildNormalizedFingerprint({ type: "block", toolMatch: "test_disable" });
    const rule = await prisma.rule.create({
      data: {
        publicId: generateRuleId(),
        accountId,
        agentId,
        type: "block",
        spec: { type: "block", tool: "test_disable" },
        normalizedFingerprint: fp,
        toolMatch: "test_disable",
      },
    });
    const now = new Date();
    const updated = await prisma.rule.update({
      where: { id: rule.id },
      data: { status: "disabled", disabledAt: now },
    });
    expect(updated.status).toBe("disabled");
    expect(updated.disabledAt).toBeTruthy();
  });

  it("removing a rule sets removedAt", async () => {
    const fp = buildNormalizedFingerprint({ type: "block", toolMatch: "test_remove" });
    const rule = await prisma.rule.create({
      data: {
        publicId: generateRuleId(),
        accountId,
        agentId,
        type: "block",
        spec: { type: "block", tool: "test_remove" },
        normalizedFingerprint: fp,
        toolMatch: "test_remove",
      },
    });
    const now = new Date();
    const updated = await prisma.rule.update({
      where: { id: rule.id },
      data: { status: "removed", removedAt: now },
    });
    expect(updated.status).toBe("removed");
    expect(updated.removedAt).toBeTruthy();
  });
});

describe("UsagePeriod uniqueness", () => {
  it("only one row per account + periodStart", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    await prisma.usagePeriod.create({
      data: {
        accountId,
        periodStart: new Date("2026-04-01"),
        periodEnd: new Date("2026-04-30"),
      },
    });
    await expect(
      prisma.usagePeriod.create({
        data: {
          accountId,
          periodStart: new Date("2026-04-01"),
          periodEnd: new Date("2026-04-30"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("EvaluationEvent constraints", () => {
  let accountId: string;
  let agentId: string;
  let usagePeriodId: string;

  beforeAll(async () => {
    accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "eval-test",
        name: "Eval Test",
        catalogHash: "abc",
      },
    });
    agentId = agent.id;
    const up = await prisma.usagePeriod.create({
      data: {
        accountId,
        periodStart: new Date("2026-04-01"),
        periodEnd: new Date("2026-04-30"),
      },
    });
    usagePeriodId = up.id;
  });

  it("targets must be object when present", async () => {
    await expect(
      prisma.evaluationEvent.create({
        data: {
          publicId: generateEvaluationId(),
          accountId,
          agentId,
          usagePeriodId,
          decision: "block",
          mode: "normal",
          sessionId: "sess-1",
          toolName: "exec",
          targets: "not an object" as any,
        },
      }),
    ).rejects.toThrow();
  });

  it("scope must be object when present", async () => {
    await expect(
      prisma.evaluationEvent.create({
        data: {
          publicId: generateEvaluationId(),
          accountId,
          agentId,
          usagePeriodId,
          decision: "block",
          mode: "normal",
          sessionId: "sess-1",
          toolName: "exec",
          scope: [1, 2, 3] as any,
        },
      }),
    ).rejects.toThrow();
  });

  it("rawInput must be object when present", async () => {
    await expect(
      prisma.evaluationEvent.create({
        data: {
          publicId: generateEvaluationId(),
          accountId,
          agentId,
          usagePeriodId,
          decision: "block",
          mode: "normal",
          sessionId: "sess-1",
          toolName: "exec",
          rawInput: [1, 2] as any,
        },
      }),
    ).rejects.toThrow();
  });

  it("can create valid evaluation event", async () => {
    const ev = await prisma.evaluationEvent.create({
      data: {
        publicId: generateEvaluationId(),
        accountId,
        agentId,
        usagePeriodId,
        decision: "block",
        mode: "normal",
        reasonCode: "blocked_tool",
        sessionId: "sess-valid",
        toolName: "exec",
        targets: { recipient: "user@example.com" },
      },
    });
    expect(ev.publicId).toMatch(/^ev_/);
    expect(ev.decision).toBe("block");
  });

  it("sessionId length enforced - empty string rejected", async () => {
    await expect(
      prisma.evaluationEvent.create({
        data: {
          publicId: generateEvaluationId(),
          accountId,
          agentId,
          usagePeriodId,
          decision: "block",
          mode: "normal",
          sessionId: "",
          toolName: "exec",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Hot-path support shape", () => {
  it("hot-path query works without spec column", async () => {
    const accountId = makeAccountId();
    await prisma.account.create({
      data: { id: accountId, publicId: generateAccountId() },
    });
    const agent = await prisma.agent.create({
      data: {
        publicId: generateAgentId(),
        accountId,
        externalId: "hotpath-test",
        name: "Hotpath Test",
        catalogHash: "abc",
      },
    });

    const fp = buildNormalizedFingerprint({
      type: "exclude",
      toolMatch: "email_archive",
      targetKind: "sender",
      targetValue: "test@example.com",
    });

    await prisma.rule.create({
      data: {
        publicId: generateRuleId(),
        accountId,
        agentId: agent.id,
        type: "exclude",
        spec: { type: "exclude", tool: "email_archive", target: { kind: "sender", value: "test@example.com" } },
        normalizedFingerprint: fp,
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValue: "test@example.com",
        targetValueNormalized: "test@example.com",
      },
    });

    // Hot-path query: SELECT normalized columns only (no spec)
    const rules = await prisma.rule.findMany({
      where: { agentId: agent.id, status: "active" },
      select: {
        publicId: true,
        type: true,
        toolMatch: true,
        targetKind: true,
        targetValueNormalized: true,
        thresholdMax: true,
        thresholdPeriod: true,
      },
    });

    expect(rules.length).toBe(1);
    expect(rules[0]!.type).toBe("exclude");
    expect(rules[0]!.toolMatch).toBe("email_archive");
    expect(rules[0]!.targetKind).toBe("sender");
    expect(rules[0]!.targetValueNormalized).toBe("test@example.com");
    // Verify spec is NOT in the result
    expect((rules[0] as any).spec).toBeUndefined();
  });
});

describe("No forbidden extras", () => {
  it("no approval tables exist", async () => {
    const result = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'approvals'
      ) as exists
    `;
    expect(result[0]!.exists).toBe(false);
  });

  it("no enterprise concept/state tables exist", async () => {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) as count FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('enterprise_concepts', 'enterprise_states', 'evidence')
    `;
    expect(Number(result[0]!.count)).toBe(0);
  });

  it("no shared_rules table exists", async () => {
    const result = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'shared_rules'
      ) as exists
    `;
    expect(result[0]!.exists).toBe(false);
  });

  it("exactly 8 application tables exist", async () => {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) as count FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '_prisma%'
    `;
    expect(Number(result[0]!.count)).toBe(8);
  });
});
