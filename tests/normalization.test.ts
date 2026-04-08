import { describe, it, expect } from "vitest";
import {
  normalizeEvaluateBody,
  normalizeCreateRuleBody,
  normalizeRegisterAgentBody,
  normalizeRulesQuery,
} from "../src/middleware/normalization.js";
import {
  trimWhitespace,
  lowercaseEnumValues,
  lowercaseEmail,
  normalizePath,
} from "../src/lib/rule-normalization.js";

describe("Pack 1 normalization helpers", () => {
  it("trims whitespace", () => {
    expect(trimWhitespace("  hello  ")).toBe("hello");
  });

  it("lowercases enum values", () => {
    expect(lowercaseEnumValues("BLOCK")).toBe("block");
    expect(lowercaseEnumValues("Confirm")).toBe("confirm");
  });

  it("lowercases sender email", () => {
    expect(lowercaseEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("normalizes path separators", () => {
    expect(normalizePath("src\\lib\\utils.ts")).toBe("src/lib/utils.ts");
    expect(normalizePath("src/lib/utils.ts")).toBe("src/lib/utils.ts");
  });
});

describe("normalizeEvaluateBody", () => {
  it("trims agent_id", () => {
    const result = normalizeEvaluateBody({
      agent_id: "  agt_123  ",
      session: { id: "s" },
      tool_call: { tool_name: "test" },
    });
    expect(result.agent_id).toBe("agt_123");
  });

  it("trims session fields", () => {
    const result = normalizeEvaluateBody({
      agent_id: "agt_123",
      session: { id: "  sess-1  ", key: "  key-1  " },
      tool_call: { tool_name: "test" },
    });
    const session = result.session as Record<string, unknown>;
    expect(session.id).toBe("sess-1");
    expect(session.key).toBe("key-1");
  });

  it("lowercases channel.type", () => {
    const result = normalizeEvaluateBody({
      agent_id: "agt_123",
      session: { id: "s" },
      channel: { type: "DIRECT", provider: "  Slack  " },
      tool_call: { tool_name: "test" },
    });
    const channel = result.channel as Record<string, unknown>;
    expect(channel.type).toBe("direct");
    expect(channel.provider).toBe("Slack");
  });

  it("lowercases action_class", () => {
    const result = normalizeEvaluateBody({
      agent_id: "agt_123",
      session: { id: "s" },
      tool_call: { tool_name: "  read_file  ", action_class: "FILE_READ" },
    });
    const toolCall = result.tool_call as Record<string, unknown>;
    expect(toolCall.tool_name).toBe("read_file");
    expect(toolCall.action_class).toBe("file_read");
  });
});

describe("normalizeCreateRuleBody", () => {
  it("trims agent_id and lowercases type", () => {
    const result = normalizeCreateRuleBody({
      agent_id: "  agt_123  ",
      type: "BLOCK",
      spec: {},
    });
    expect(result.agent_id).toBe("agt_123");
    expect(result.type).toBe("block");
  });
});

describe("normalizeRegisterAgentBody", () => {
  it("trims agent fields and lowercases source", () => {
    const result = normalizeRegisterAgentBody({
      agent: {
        external_id: "  ext-1  ",
        name: "  Test Agent  ",
        source: "OPENCLAW",
      },
      tools: [{ name: "  read_file  ", action_class: "FILE_READ" }],
      catalog_hash: "  abc123  ",
    });
    const agent = result.agent as Record<string, unknown>;
    expect(agent.external_id).toBe("ext-1");
    expect(agent.name).toBe("Test Agent");
    expect(agent.source).toBe("openclaw");

    const tools = result.tools as Array<Record<string, unknown>>;
    expect(tools[0].name).toBe("read_file");
    expect(tools[0].action_class).toBe("file_read");

    expect(result.catalog_hash).toBe("abc123");
  });
});

describe("normalizeRulesQuery", () => {
  it("trims and lowercases", () => {
    const result = normalizeRulesQuery({
      agent_id: "  agt_123  ",
      status: "ACTIVE",
    });
    expect(result.agent_id).toBe("agt_123");
    expect(result.status).toBe("active");
  });
});
