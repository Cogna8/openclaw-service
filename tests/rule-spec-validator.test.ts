import { describe, it, expect } from "vitest";
import { validateAndNormalizeRuleSpec } from "../src/services/rule-spec-validator.js";
import { ValidationError } from "../src/lib/errors.js";

describe("rule-spec-validator", () => {
  // --- block ---
  describe("block", () => {
    it("valid block spec", () => {
      const result = validateAndNormalizeRuleSpec("block", { tool: "exec" });
      expect(result.normalized.toolMatch).toBe("exec");
      expect(result.normalized.targetKind).toBeNull();
      expect(result.normalizedSpec).toEqual({ tool: "exec" });
    });

    it("rejects missing tool", () => {
      expect(() => validateAndNormalizeRuleSpec("block", {})).toThrow(ValidationError);
    });

    it("rejects unknown spec fields", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("block", { tool: "exec", extra: true }),
      ).toThrow(ValidationError);
    });

    it("rejects invalid tool characters", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("block", { tool: "exec rm" }),
      ).toThrow(ValidationError);
    });
  });

  // --- confirm ---
  describe("confirm", () => {
    it("valid confirm spec", () => {
      const result = validateAndNormalizeRuleSpec("confirm", { tool: "file_delete" });
      expect(result.normalized.toolMatch).toBe("file_delete");
      expect(result.normalizedSpec).toEqual({ tool: "file_delete" });
    });

    it("rejects missing tool", () => {
      expect(() => validateAndNormalizeRuleSpec("confirm", {})).toThrow(ValidationError);
    });
  });

  // --- exclude ---
  describe("exclude", () => {
    it("valid exclude spec", () => {
      const result = validateAndNormalizeRuleSpec("exclude", {
        tool: "email_archive",
        target: "sender",
        value: "Sarah@Example.com",
      });
      expect(result.normalized.toolMatch).toBe("email_archive");
      expect(result.normalized.targetKind).toBe("sender");
      expect(result.normalized.targetValue).toBe("Sarah@Example.com");
      expect(result.normalized.targetValueNormalized).toBe("sarah@example.com");
    });

    it("rejects missing tool", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("exclude", { target: "sender", value: "a@b.com" }),
      ).toThrow(ValidationError);
    });

    it("rejects missing target", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("exclude", { tool: "exec", value: "test" }),
      ).toThrow(ValidationError);
    });

    it("rejects missing value", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("exclude", { tool: "exec", target: "sender" }),
      ).toThrow(ValidationError);
    });

    it("rejects unknown fields", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("exclude", {
          tool: "exec",
          target: "sender",
          value: "a@b.com",
          extra: true,
        }),
      ).toThrow(ValidationError);
    });

    it("value max length 500 enforcement", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("exclude", {
          tool: "exec",
          target: "sender",
          value: "x".repeat(501),
        }),
      ).toThrow(ValidationError);
    });

    it("sender lowercasing", () => {
      const result = validateAndNormalizeRuleSpec("exclude", {
        tool: "email_archive",
        target: "sender",
        value: "CEO@Company.COM",
      });
      expect(result.normalized.targetValueNormalized).toBe("ceo@company.com");
    });
  });

  // --- protect ---
  describe("protect", () => {
    it("valid protect spec", () => {
      const result = validateAndNormalizeRuleSpec("protect", {
        target: "path",
        value: "/home/user/.ssh/*",
      });
      expect(result.normalized.toolMatch).toBeNull();
      expect(result.normalized.targetKind).toBe("path");
      expect(result.normalized.targetValueNormalized).toBe("/home/user/.ssh/*");
      expect(result.normalizedSpec).toEqual({
        target: "path",
        value: "/home/user/.ssh/*",
      });
    });

    it("rejects tool field for protect", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("protect", {
          tool: "exec",
          target: "path",
          value: "/home",
        }),
      ).toThrow(ValidationError);
      try {
        validateAndNormalizeRuleSpec("protect", {
          tool: "exec",
          target: "path",
          value: "/home",
        });
      } catch (e: any) {
        expect(e.field).toBe("spec.tool");
      }
    });

    it("rejects missing target", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("protect", { value: "/home" }),
      ).toThrow(ValidationError);
    });

    it("rejects missing value", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("protect", { target: "path" }),
      ).toThrow(ValidationError);
    });

    it("path normalization (backslash to forward slash)", () => {
      const result = validateAndNormalizeRuleSpec("protect", {
        target: "path",
        value: "C:\\Users\\admin\\.ssh\\*",
      });
      expect(result.normalized.targetValueNormalized).toBe("c:/users/admin/.ssh/*");
    });

    it("value max length 500 enforcement", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("protect", {
          target: "path",
          value: "/".repeat(501),
        }),
      ).toThrow(ValidationError);
    });

    it("rejects unknown fields", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("protect", {
          target: "path",
          value: "/home",
          extra: true,
        }),
      ).toThrow(ValidationError);
    });
  });

  // --- threshold ---
  describe("threshold", () => {
    it("valid threshold spec", () => {
      const result = validateAndNormalizeRuleSpec("threshold", {
        tool: "file_delete",
        max: 10,
      });
      expect(result.normalized.toolMatch).toBe("file_delete");
      expect(result.normalized.thresholdMax).toBe(10);
      expect(result.normalized.thresholdPeriod).toBe("session");
      expect(result.normalizedSpec.period).toBe("session");
    });

    it("period defaults to session", () => {
      const result = validateAndNormalizeRuleSpec("threshold", {
        tool: "exec",
        max: 5,
      });
      expect(result.normalized.thresholdPeriod).toBe("session");
    });

    it("explicit period = session accepted", () => {
      const result = validateAndNormalizeRuleSpec("threshold", {
        tool: "exec",
        max: 5,
        period: "Session",
      });
      expect(result.normalized.thresholdPeriod).toBe("session");
    });

    it("rejects max < 1", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", { tool: "exec", max: 0 }),
      ).toThrow(ValidationError);
    });

    it("rejects max > 1000", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", { tool: "exec", max: 1001 }),
      ).toThrow(ValidationError);
    });

    it("rejects non-integer max", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", { tool: "exec", max: 5.5 }),
      ).toThrow(ValidationError);
    });

    it("rejects missing max", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", { tool: "exec" }),
      ).toThrow(ValidationError);
    });

    it("rejects missing tool", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", { max: 10 }),
      ).toThrow(ValidationError);
    });

    it("rejects unknown period value", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", {
          tool: "exec",
          max: 5,
          period: "daily",
        }),
      ).toThrow(ValidationError);
    });

    it("rejects unknown fields", () => {
      expect(() =>
        validateAndNormalizeRuleSpec("threshold", {
          tool: "exec",
          max: 10,
          extra: true,
        }),
      ).toThrow(ValidationError);
    });
  });

  // --- field paths ---
  describe("error field paths", () => {
    it("block missing tool has correct field", () => {
      try {
        validateAndNormalizeRuleSpec("block", {});
      } catch (e: any) {
        expect(e.field).toBe("spec.tool");
      }
    });

    it("exclude missing target has correct field", () => {
      try {
        validateAndNormalizeRuleSpec("exclude", { tool: "exec", value: "v" });
      } catch (e: any) {
        expect(e.field).toBe("spec.target");
      }
    });

    it("threshold missing max has correct field", () => {
      try {
        validateAndNormalizeRuleSpec("threshold", { tool: "exec" });
      } catch (e: any) {
        expect(e.field).toBe("spec.max");
      }
    });
  });
});
