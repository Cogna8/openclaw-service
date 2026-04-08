import { describe, it, expect } from "vitest";
import {
  activateRule,
  disableRule,
  removeRule,
  validateRuleStatusConsistency,
} from "../src/lib/rule-status.js";

describe("Rule status helpers", () => {
  const baseRule = {
    status: "active" as const,
    disabledAt: null,
    removedAt: null,
  };

  describe("activateRule", () => {
    it("sets status to active with null timestamps", () => {
      const disabled = { status: "disabled" as const, disabledAt: new Date(), removedAt: null };
      const result = activateRule(disabled);
      expect(result.status).toBe("active");
      expect(result.disabledAt).toBeNull();
      expect(result.removedAt).toBeNull();
    });
  });

  describe("disableRule", () => {
    it("sets status to disabled with disabledAt timestamp", () => {
      const result = disableRule(baseRule);
      expect(result.status).toBe("disabled");
      expect(result.disabledAt).toBeInstanceOf(Date);
      expect(result.removedAt).toBeNull();
    });
  });

  describe("removeRule", () => {
    it("sets status to removed with removedAt timestamp", () => {
      const result = removeRule(baseRule);
      expect(result.status).toBe("removed");
      expect(result.removedAt).toBeInstanceOf(Date);
    });
  });

  describe("validateRuleStatusConsistency", () => {
    it("returns true for valid active state", () => {
      expect(
        validateRuleStatusConsistency({
          status: "active",
          disabledAt: null,
          removedAt: null,
        }),
      ).toBe(true);
    });

    it("returns true for valid disabled state", () => {
      expect(
        validateRuleStatusConsistency({
          status: "disabled",
          disabledAt: new Date(),
          removedAt: null,
        }),
      ).toBe(true);
    });

    it("returns true for valid removed state", () => {
      expect(
        validateRuleStatusConsistency({
          status: "removed",
          disabledAt: new Date(),
          removedAt: new Date(),
        }),
      ).toBe(true);
    });

    it("returns true for removed without disabledAt", () => {
      expect(
        validateRuleStatusConsistency({
          status: "removed",
          disabledAt: null,
          removedAt: new Date(),
        }),
      ).toBe(true);
    });

    it("returns false for active with disabledAt set", () => {
      expect(
        validateRuleStatusConsistency({
          status: "active",
          disabledAt: new Date(),
          removedAt: null,
        }),
      ).toBe(false);
    });

    it("returns false for active with removedAt set", () => {
      expect(
        validateRuleStatusConsistency({
          status: "active",
          disabledAt: null,
          removedAt: new Date(),
        }),
      ).toBe(false);
    });

    it("returns false for disabled without disabledAt", () => {
      expect(
        validateRuleStatusConsistency({
          status: "disabled",
          disabledAt: null,
          removedAt: null,
        }),
      ).toBe(false);
    });

    it("returns false for disabled with removedAt set", () => {
      expect(
        validateRuleStatusConsistency({
          status: "disabled",
          disabledAt: new Date(),
          removedAt: new Date(),
        }),
      ).toBe(false);
    });

    it("returns false for removed without removedAt", () => {
      expect(
        validateRuleStatusConsistency({
          status: "removed",
          disabledAt: null,
          removedAt: null,
        }),
      ).toBe(false);
    });
  });
});
