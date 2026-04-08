import { describe, it, expect } from "vitest";
import { matchRules, type NormalizedToolCall } from "../src/services/rule-matcher.js";
import type { CachedRule } from "../src/services/rule-cache.js";

function makeCall(overrides: Partial<NormalizedToolCall> = {}): NormalizedToolCall {
  return {
    toolName: "file_delete",
    actionClass: "file_delete",
    sender: null,
    path: null,
    resourceId: null,
    countInSession: null,
    ...overrides,
  };
}

function makeRule(overrides: Partial<CachedRule> & Pick<CachedRule, "type">): CachedRule {
  return {
    id: "rule-uuid-1",
    publicId: "rl_test1",
    toolMatch: null,
    targetKind: null,
    targetValueNormalized: null,
    thresholdMax: null,
    thresholdPeriod: null,
    ...overrides,
  };
}

describe("rule-matcher", () => {
  // Block tests
  it("block by action class", () => {
    const rules = [makeRule({ type: "block", toolMatch: "file_delete" })];
    const call = makeCall({ actionClass: "file_delete" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("block");
    expect(result!.reasonCode).toBe("blocked_tool");
  });

  it("block by exact tool name fallback (no action class match)", () => {
    const rules = [makeRule({ type: "block", toolMatch: "rm_tool" })];
    const call = makeCall({ toolName: "rm_tool", actionClass: null });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("block");
    expect(result!.reasonCode).toBe("blocked_tool");
  });

  // Confirm tests
  it("confirm returns block + confirmation_required", () => {
    const rules = [makeRule({ type: "confirm", toolMatch: "file_delete" })];
    const call = makeCall({ actionClass: "file_delete" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("confirm");
    expect(result!.reasonCode).toBe("confirmation_required");
    expect(result!.message).toContain("Confirmation required");
  });

  // Exclude tests
  it("exclude sender match (tool + target both must match)", () => {
    const rules = [
      makeRule({
        type: "exclude",
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValueNormalized: "sarah@example.com",
      }),
    ];
    const call = makeCall({
      actionClass: "email_archive",
      sender: "sarah@example.com",
    });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("exclude");
    expect(result!.reasonCode).toBe("excluded_target");
  });

  it("exclude path match", () => {
    const rules = [
      makeRule({
        type: "exclude",
        toolMatch: "file_read",
        targetKind: "path",
        targetValueNormalized: "/tmp/cache",
      }),
    ];
    const call = makeCall({
      actionClass: "file_read",
      path: "/tmp/cache",
    });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("excluded_target");
  });

  it("exclude: tool matches but target does not = no match", () => {
    const rules = [
      makeRule({
        type: "exclude",
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValueNormalized: "sarah@example.com",
      }),
    ];
    const call = makeCall({
      actionClass: "email_archive",
      sender: "bob@example.com",
    });
    const result = matchRules(rules, call);
    expect(result).toBeNull();
  });

  // Protect tests
  it("protect sender exact match", () => {
    const rules = [
      makeRule({
        type: "protect",
        targetKind: "sender",
        targetValueNormalized: "sarah@example.com",
      }),
    ];
    const call = makeCall({ sender: "sarah@example.com" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("protect");
    expect(result!.reasonCode).toBe("protected_target");
  });

  it("protect resource_id exact match", () => {
    const rules = [
      makeRule({
        type: "protect",
        targetKind: "resource_id",
        targetValueNormalized: "doc-123",
      }),
    ];
    const call = makeCall({ resourceId: "doc-123" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("protected_target");
  });

  it("protect path exact match (no glob)", () => {
    const rules = [
      makeRule({
        type: "protect",
        targetKind: "path",
        targetValueNormalized: "/home/user/.env",
      }),
    ];
    const call = makeCall({ path: "/home/user/.env" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("protected_target");
  });

  it("protect path prefix-glob match (ends with /*)", () => {
    const rules = [
      makeRule({
        type: "protect",
        targetKind: "path",
        targetValueNormalized: "/home/user/.ssh/*",
      }),
    ];
    const call = makeCall({ path: "/home/user/.ssh/id_rsa" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("protected_target");
    expect(result!.message).toContain("/home/user/.ssh/*");
  });

  it("protect path: non-matching prefix = no match", () => {
    const rules = [
      makeRule({
        type: "protect",
        targetKind: "path",
        targetValueNormalized: "/home/user/.ssh/*",
      }),
    ];
    const call = makeCall({ path: "/home/user/documents/file.txt" });
    const result = matchRules(rules, call);
    expect(result).toBeNull();
  });

  // Threshold tests
  it("threshold blocks when countInSession >= max", () => {
    const rules = [
      makeRule({
        type: "threshold",
        toolMatch: "file_delete",
        thresholdMax: 10,
        thresholdPeriod: "session",
      }),
    ];
    const call = makeCall({ actionClass: "file_delete", countInSession: 10 });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("threshold");
    expect(result!.reasonCode).toBe("threshold_exceeded");
  });

  it("threshold: countInSession < max = no match", () => {
    const rules = [
      makeRule({
        type: "threshold",
        toolMatch: "file_delete",
        thresholdMax: 10,
        thresholdPeriod: "session",
      }),
    ];
    const call = makeCall({ actionClass: "file_delete", countInSession: 9 });
    const result = matchRules(rules, call);
    expect(result).toBeNull();
  });

  it("threshold: countInSession missing (null) = no match", () => {
    const rules = [
      makeRule({
        type: "threshold",
        toolMatch: "file_delete",
        thresholdMax: 10,
        thresholdPeriod: "session",
      }),
    ];
    const call = makeCall({ actionClass: "file_delete", countInSession: null });
    const result = matchRules(rules, call);
    expect(result).toBeNull();
  });

  // Edge cases
  it("no rules returns null", () => {
    const call = makeCall();
    const result = matchRules([], call);
    expect(result).toBeNull();
  });

  it("no targets means protect/exclude do not match", () => {
    const rules = [
      makeRule({
        type: "protect",
        targetKind: "sender",
        targetValueNormalized: "sarah@example.com",
      }),
      makeRule({
        type: "exclude",
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValueNormalized: "sarah@example.com",
      }),
    ];
    const call = makeCall({
      actionClass: "email_archive",
      sender: null,
      path: null,
      resourceId: null,
    });
    const result = matchRules(rules, call);
    expect(result).toBeNull();
  });

  // Priority tests
  it("priority order: protect beats block when both could match", () => {
    const rules = [
      makeRule({
        id: "block-uuid",
        publicId: "rl_block",
        type: "block",
        toolMatch: "file_delete",
      }),
      makeRule({
        id: "protect-uuid",
        publicId: "rl_protect",
        type: "protect",
        targetKind: "path",
        targetValueNormalized: "/critical/*",
      }),
    ];
    const call = makeCall({
      actionClass: "file_delete",
      path: "/critical/data.db",
    });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("protect");
    expect(result!.reasonCode).toBe("protected_target");
  });

  it("priority order: block beats threshold", () => {
    const rules = [
      makeRule({
        id: "threshold-uuid",
        publicId: "rl_threshold",
        type: "threshold",
        toolMatch: "file_delete",
        thresholdMax: 5,
        thresholdPeriod: "session",
      }),
      makeRule({
        id: "block-uuid",
        publicId: "rl_block",
        type: "block",
        toolMatch: "file_delete",
      }),
    ];
    const call = makeCall({
      actionClass: "file_delete",
      countInSession: 10,
    });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("block");
  });

  it("multiple rules of same type: first match wins", () => {
    const rules = [
      makeRule({
        id: "block-1",
        publicId: "rl_first",
        type: "block",
        toolMatch: "file_delete",
      }),
      makeRule({
        id: "block-2",
        publicId: "rl_second",
        type: "block",
        toolMatch: "file_delete",
      }),
    ];
    const call = makeCall({ actionClass: "file_delete" });
    const result = matchRules(rules, call);
    expect(result).not.toBeNull();
    expect(result!.rulePublicId).toBe("rl_first");
  });
});
