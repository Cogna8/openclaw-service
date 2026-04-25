import { describe, it, expect } from "vitest";
import { matchRules, type NormalizedToolCall } from "../src/services/rule-matcher.js";
import type { CachedRule } from "../src/services/rule-cache.js";
import { globToRegex, hasGlob } from "../src/lib/glob-to-regex.js";

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
  const base: CachedRule = {
    id: "rule-uuid-1",
    publicId: "rl_test1",
    toolMatch: null,
    toolMatchRegex: null,
    targetKind: null,
    targetValueNormalized: null,
    targetValueRegex: null,
    thresholdMax: null,
    thresholdPeriod: null,
    ...overrides,
  };
  // Mirror rule-loader: compile regex from glob when pattern has a wildcard
  // and the test caller didn't provide an explicit regex.
  if (
    base.toolMatch !== null &&
    hasGlob(base.toolMatch) &&
    overrides.toolMatchRegex === undefined
  ) {
    base.toolMatchRegex = globToRegex(base.toolMatch.toLowerCase());
  }
  if (
    base.targetValueNormalized !== null &&
    hasGlob(base.targetValueNormalized) &&
    overrides.targetValueRegex === undefined
  ) {
    base.targetValueRegex = globToRegex(base.targetValueNormalized.toLowerCase());
  }
  return base;
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

  // Glob matching — tool_match
  it("glob: tool_match 'bash*' matches bash and bash_execute", () => {
    const r1 = matchRules(
      [{ ...makeRule({ type: "block", toolMatch: "bash*" }), toolMatchRegex: /^bash[^/]*$/i }],
      makeCall({ toolName: "bash", actionClass: null }),
    );
    expect(r1).not.toBeNull();
    expect(r1!.ruleType).toBe("block");

    const r2 = matchRules(
      [{ ...makeRule({ type: "block", toolMatch: "bash*" }), toolMatchRegex: /^bash[^/]*$/i }],
      makeCall({ toolName: "bash_execute", actionClass: null }),
    );
    expect(r2).not.toBeNull();
  });

  it("glob: tool_match 'bash*' does NOT match run_bash_command", () => {
    const result = matchRules(
      [{ ...makeRule({ type: "block", toolMatch: "bash*" }), toolMatchRegex: /^bash[^/]*$/i }],
      makeCall({ toolName: "run_bash_command", actionClass: null }),
    );
    expect(result).toBeNull();
  });

  it("glob: tool_match '*delete*' matches file_delete and delete_file but not read_file", () => {
    const re = /^[^/]*delete[^/]*$/i;
    const rule = { ...makeRule({ type: "block", toolMatch: "*delete*" }), toolMatchRegex: re };

    expect(matchRules([rule], makeCall({ toolName: "file_delete", actionClass: null }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ toolName: "delete_file", actionClass: null }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ toolName: "read_file", actionClass: null }))).toBeNull();
  });

  it("glob: exact tool_match still works (no regex compiled)", () => {
    const rule = makeRule({ type: "block", toolMatch: "bash" }); // toolMatchRegex defaults to null/undefined
    expect(matchRules([rule], makeCall({ toolName: "bash", actionClass: null }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ toolName: "bash_execute", actionClass: null }))).toBeNull();
  });

  // Glob matching — target_value (path)
  it("glob: target_value '/etc/**' matches /etc/hosts and /etc/ssh/sshd_config", () => {
    const re = /^\/etc\/.*$/i;
    const rule = {
      ...makeRule({
        type: "protect",
        targetKind: "path",
        targetValueNormalized: "/etc/**",
      }),
      targetValueRegex: re,
    };

    expect(matchRules([rule], makeCall({ path: "/etc/hosts" }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ path: "/etc/ssh/sshd_config" }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ path: "/home/user/file.txt" }))).toBeNull();
  });

  it("glob: target_value '/etc/*' (single-segment) matches /etc/hosts but NOT /etc/ssh/sshd_config", () => {
    const re = /^\/etc\/[^/]*$/i;
    const rule = {
      ...makeRule({
        type: "protect",
        targetKind: "path",
        targetValueNormalized: "/etc/*",
      }),
      targetValueRegex: re,
    };

    expect(matchRules([rule], makeCall({ path: "/etc/hosts" }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ path: "/etc/ssh/sshd_config" }))).toBeNull();
  });

  // Regex metacharacter escape regression
  it("glob: tool_match 'a.b' matches literal a.b only (regex metachars escaped)", () => {
    const re = /^a\.b$/i;
    const rule = { ...makeRule({ type: "block", toolMatch: "a.b" }), toolMatchRegex: re };

    expect(matchRules([rule], makeCall({ toolName: "a.b", actionClass: null }))).not.toBeNull();
    expect(matchRules([rule], makeCall({ toolName: "aXb", actionClass: null }))).toBeNull();
  });
});
