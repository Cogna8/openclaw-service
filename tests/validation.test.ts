import { describe, it, expect } from "vitest";
import {
  validateString,
  validateOptionalString,
  validateEnum,
  validateOptionalEnum,
  validatePositiveInt,
  validateJsonObject,
  validateOptionalJsonObject,
  rejectUnknownTopLevelFields,
  validateEvaluateBody,
  validateCreateRuleBody,
  validateRegisterAgentBody,
  validateRulesQuery,
  validateRuleIdParam,
} from "../src/middleware/validation.js";
import { ValidationError, PayloadTooLargeError } from "../src/lib/errors.js";

// --- parseJsonBody tests use a helper to construct NextRequest-like objects ---
import { parseJsonBody } from "../src/middleware/validation.js";

function makeRequest(body: string, contentType = "application/json"): any {
  return {
    headers: {
      get: (name: string) => {
        if (name === "content-type") return contentType;
        return null;
      },
    },
    text: async () => body,
  };
}

describe("parseJsonBody", () => {
  it("rejects non-JSON content type", async () => {
    const req = makeRequest("{}", "text/plain");
    await expect(parseJsonBody(req)).rejects.toThrow(ValidationError);
  });

  it("rejects oversize body", async () => {
    const largeBody = JSON.stringify({ data: "x".repeat(9000) });
    const req = makeRequest(largeBody);
    await expect(parseJsonBody(req)).rejects.toThrow(PayloadTooLargeError);
  });

  it("rejects invalid JSON", async () => {
    const req = makeRequest("{not valid json}");
    await expect(parseJsonBody(req)).rejects.toThrow(ValidationError);
  });

  it("rejects array body", async () => {
    const req = makeRequest("[1,2,3]");
    await expect(parseJsonBody(req)).rejects.toThrow(ValidationError);
  });

  it("rejects null body", async () => {
    const req = makeRequest("null");
    await expect(parseJsonBody(req)).rejects.toThrow(ValidationError);
  });

  it("rejects string body", async () => {
    const req = makeRequest('"hello"');
    await expect(parseJsonBody(req)).rejects.toThrow(ValidationError);
  });

  it("accepts valid JSON object", async () => {
    const req = makeRequest('{"key": "value"}');
    const result = await parseJsonBody(req);
    expect(result).toEqual({ key: "value" });
  });

  it("accepts application/json with charset", async () => {
    const req = makeRequest('{"key": "value"}', "application/json; charset=utf-8");
    const result = await parseJsonBody(req);
    expect(result).toEqual({ key: "value" });
  });

  it("enforces actual byte size, not string length", async () => {
    // Multi-byte characters: each emoji is 4 bytes in UTF-8
    // 2100 emojis = 8400 bytes + JSON wrapper > 8192
    const emoji = "😀".repeat(2100);
    const body = JSON.stringify({ data: emoji });
    const req = makeRequest(body);
    await expect(parseJsonBody(req)).rejects.toThrow(PayloadTooLargeError);
  });

  it("respects custom maxBytes", async () => {
    const body = JSON.stringify({ data: "x".repeat(100) });
    const req = makeRequest(body);
    await expect(parseJsonBody(req, 50)).rejects.toThrow(PayloadTooLargeError);
  });
});

describe("shared validators", () => {
  describe("validateString", () => {
    it("throws on missing field", () => {
      expect(() => validateString({}, "name")).toThrow(ValidationError);
    });

    it("throws on non-string field", () => {
      expect(() => validateString({ name: 42 }, "name")).toThrow(ValidationError);
    });

    it("throws on empty string", () => {
      expect(() => validateString({ name: "  " }, "name")).toThrow(ValidationError);
    });

    it("throws on exceeding maxLength", () => {
      expect(() => validateString({ name: "a".repeat(10) }, "name", 5)).toThrow(
        ValidationError,
      );
    });

    it("returns valid string", () => {
      expect(validateString({ name: "hello" }, "name")).toBe("hello");
    });
  });

  describe("validateOptionalString", () => {
    it("returns undefined for missing field", () => {
      expect(validateOptionalString({}, "name")).toBeUndefined();
    });

    it("returns string if present", () => {
      expect(validateOptionalString({ name: "hello" }, "name")).toBe("hello");
    });
  });

  describe("validateEnum", () => {
    it("throws on invalid enum", () => {
      expect(() => validateEnum({ t: "invalid" }, "t", ["a", "b"])).toThrow(
        ValidationError,
      );
    });

    it("accepts valid enum (case-insensitive)", () => {
      expect(validateEnum({ t: "A" }, "t", ["a", "b"])).toBe("a");
    });
  });

  describe("validateOptionalEnum", () => {
    it("returns undefined for missing", () => {
      expect(validateOptionalEnum({}, "t", ["a"])).toBeUndefined();
    });

    it("throws on invalid value", () => {
      expect(() => validateOptionalEnum({ t: "x" }, "t", ["a"])).toThrow(
        ValidationError,
      );
    });
  });

  describe("validatePositiveInt", () => {
    it("throws on non-integer", () => {
      expect(() => validatePositiveInt({ n: 1.5 }, "n")).toThrow(ValidationError);
    });

    it("throws on zero", () => {
      expect(() => validatePositiveInt({ n: 0 }, "n")).toThrow(ValidationError);
    });

    it("accepts positive integer", () => {
      expect(validatePositiveInt({ n: 5 }, "n")).toBe(5);
    });
  });

  describe("validateJsonObject", () => {
    it("throws on missing", () => {
      expect(() => validateJsonObject({}, "obj")).toThrow(ValidationError);
    });

    it("throws on array", () => {
      expect(() => validateJsonObject({ obj: [] }, "obj")).toThrow(ValidationError);
    });

    it("accepts object", () => {
      expect(validateJsonObject({ obj: { a: 1 } }, "obj")).toEqual({ a: 1 });
    });
  });

  describe("validateOptionalJsonObject", () => {
    it("returns undefined for missing", () => {
      expect(validateOptionalJsonObject({}, "obj")).toBeUndefined();
    });

    it("accepts object", () => {
      expect(validateOptionalJsonObject({ obj: { a: 1 } }, "obj")).toEqual({ a: 1 });
    });
  });

  describe("rejectUnknownTopLevelFields", () => {
    it("throws on unknown fields", () => {
      expect(() =>
        rejectUnknownTopLevelFields({ a: 1, b: 2, c: 3 }, ["a", "b"]),
      ).toThrow(ValidationError);
    });

    it("passes when all fields are known", () => {
      expect(() =>
        rejectUnknownTopLevelFields({ a: 1, b: 2 }, ["a", "b", "c"]),
      ).not.toThrow();
    });
  });
});

describe("validateEvaluateBody", () => {
  const validBody = () => ({
    agent_id: "agt_test123",
    session: { id: "sess-1" },
    tool_call: { tool_name: "read_file" },
  });

  it("passes with valid minimal payload", () => {
    expect(() => validateEvaluateBody(validBody())).not.toThrow();
  });

  it("passes with full payload", () => {
    expect(() =>
      validateEvaluateBody({
        agent_id: "agt_test123",
        session: { id: "sess-1", key: "key-1" },
        channel: { provider: "slack", type: "direct" },
        tool_call: {
          tool_name: "read_file",
          action_class: "file_read",
          targets: {},
          scope: {},
          raw_input: { path: "/tmp/test" },
        },
      }),
    ).not.toThrow();
  });

  it("rejects missing agent_id", () => {
    const body = validBody();
    delete (body as any).agent_id;
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects missing session", () => {
    const body = validBody();
    delete (body as any).session;
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects missing tool_call", () => {
    const body = validBody();
    delete (body as any).tool_call;
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects unknown top-level field", () => {
    const body = { ...validBody(), extra: "nope" };
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects invalid tool_name characters", () => {
    const body = validBody();
    body.tool_call.tool_name = "read file!";
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects invalid action_class", () => {
    const body = validBody();
    (body.tool_call as any).action_class = "not_real";
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects invalid channel.type", () => {
    const body = { ...validBody(), channel: { type: "invalid" } };
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });

  it("rejects oversized raw_input", () => {
    const body = validBody();
    (body.tool_call as any).raw_input = { data: "x".repeat(3000) };
    expect(() => validateEvaluateBody(body)).toThrow(ValidationError);
  });
});

describe("validateCreateRuleBody", () => {
  const validBody = () => ({
    agent_id: "agt_test123",
    type: "block",
    spec: { tool: "rm" },
  });

  it("passes with valid payload", () => {
    expect(() => validateCreateRuleBody(validBody())).not.toThrow();
  });

  it("rejects missing agent_id", () => {
    const body = validBody();
    delete (body as any).agent_id;
    expect(() => validateCreateRuleBody(body)).toThrow(ValidationError);
  });

  it("rejects invalid type", () => {
    const body = { ...validBody(), type: "invalid" };
    expect(() => validateCreateRuleBody(body)).toThrow(ValidationError);
  });

  it("rejects unknown fields", () => {
    const body = { ...validBody(), extra: true };
    expect(() => validateCreateRuleBody(body)).toThrow(ValidationError);
  });
});

describe("validateRegisterAgentBody", () => {
  const validBody = () => ({
    agent: { external_id: "ext-1", name: "Test Agent" },
    tools: [{ name: "read_file" }],
    catalog_hash: "abc123",
  });

  it("passes with valid payload", () => {
    expect(() => validateRegisterAgentBody(validBody())).not.toThrow();
  });

  it("rejects missing agent", () => {
    const body = validBody();
    delete (body as any).agent;
    expect(() => validateRegisterAgentBody(body)).toThrow(ValidationError);
  });

  it("rejects missing tools", () => {
    const body = validBody();
    delete (body as any).tools;
    expect(() => validateRegisterAgentBody(body)).toThrow(ValidationError);
  });

  it("rejects too many tools", () => {
    const body = validBody();
    body.tools = Array.from({ length: 201 }, (_, i) => ({ name: `t${i}` }));
    expect(() => validateRegisterAgentBody(body)).toThrow(ValidationError);
  });

  it("rejects non-array tools", () => {
    const body = { ...validBody(), tools: "not-array" };
    expect(() => validateRegisterAgentBody(body as any)).toThrow(ValidationError);
  });

  it("rejects tool without name", () => {
    const body = validBody();
    body.tools = [{ name: "" }];
    expect(() => validateRegisterAgentBody(body)).toThrow(ValidationError);
  });
});

describe("validateRulesQuery", () => {
  it("requires agent_id", () => {
    const params = new URLSearchParams();
    expect(() => validateRulesQuery(params)).toThrow(ValidationError);
  });

  it("defaults status to active", () => {
    const params = new URLSearchParams({ agent_id: "agt_123" });
    expect(validateRulesQuery(params)).toEqual({
      agent_id: "agt_123",
      status: "active",
    });
  });

  it("rejects invalid status", () => {
    const params = new URLSearchParams({ agent_id: "agt_123", status: "bogus" });
    expect(() => validateRulesQuery(params)).toThrow(ValidationError);
  });

  it("accepts valid status values", () => {
    for (const status of ["active", "disabled", "all"]) {
      const params = new URLSearchParams({ agent_id: "agt_123", status });
      expect(validateRulesQuery(params).status).toBe(status);
    }
  });
});

describe("validateRuleIdParam", () => {
  it("rejects empty ruleId", () => {
    expect(() => validateRuleIdParam("")).toThrow(ValidationError);
  });

  it("rejects ruleId without rl_ prefix", () => {
    expect(() => validateRuleIdParam("abc123")).toThrow(ValidationError);
  });

  it("accepts valid ruleId", () => {
    expect(() => validateRuleIdParam("rl_abc123")).not.toThrow();
  });
});
