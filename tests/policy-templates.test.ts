import { describe, expect, it } from "vitest";
import {
  CRITICAL_DEFAULT_TEMPLATE_IDS,
  POLICY_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_IDS,
  TEMPLATE_RISK_CLASSES,
  getTemplate,
  isValidTemplateId,
} from "../src/lib/policy-templates.js";

describe("policy templates", () => {
  it("keeps TEMPLATE_IDS and POLICY_TEMPLATES in sync", () => {
    expect(POLICY_TEMPLATES.map((t) => t.id).sort()).toEqual(
      [...TEMPLATE_IDS].sort(),
    );
  });

  it("has unique template ids", () => {
    const ids = POLICY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves the existing 5 template ids", () => {
    expect([...TEMPLATE_IDS].sort()).toEqual(
      [
        "block_code_execution",
        "block_file_deletion",
        "block_file_writes",
        "block_outbound_http",
        "block_shell_execution",
      ].sort(),
    );
  });

  it("has lowercase unique variants matching the request validator charset, with detailed rows in sync", () => {
    // The request validator enforces /^[a-zA-Z0-9_-]+$/ on tool_call.tool_name.
    // Variants that include any other characters (e.g. dots) can NEVER match a
    // real request because the request would be rejected at validation. Enforce
    // the lowercase subset here so this can't regress.
    const VARIANT_RE = /^[a-z0-9_-]+$/;

    for (const template of POLICY_TEMPLATES) {
      const variants = new Set(template.variants);
      expect(
        variants.size,
        `${template.id}: variants must be unique`,
      ).toBe(template.variants.length);

      for (const variant of template.variants) {
        expect(variant).toBe(variant.toLowerCase());
        expect(
          variant,
          `${template.id}: variant '${variant}' must match ${VARIANT_RE}`,
        ).toMatch(VARIANT_RE);
      }

      const detailedPatterns = template.variantsDetailed.map((v) => v.pattern);
      expect(
        detailedPatterns.sort(),
        `${template.id}: variantsDetailed patterns must equal variants`,
      ).toEqual([...template.variants].sort());
    }
  });

  it("has exactly one variantsDetailed entry per variant", () => {
    for (const template of POLICY_TEMPLATES) {
      const counts = new Map<string, number>();
      for (const v of template.variantsDetailed) {
        counts.set(v.pattern, (counts.get(v.pattern) ?? 0) + 1);
      }
      for (const [pattern, count] of counts) {
        expect(
          count,
          `${template.id}: pattern '${pattern}' appears ${count} times`,
        ).toBe(1);
      }
    }
  });

  it("has non-empty descriptions for every variantsDetailed row", () => {
    for (const template of POLICY_TEMPLATES) {
      for (const v of template.variantsDetailed) {
        expect(
          v.description.trim().length,
          `${template.id}: variant '${v.pattern}' has empty description`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("has valid risk classes and categories", () => {
    for (const template of POLICY_TEMPLATES) {
      expect(
        TEMPLATE_RISK_CLASSES,
        `${template.id}: invalid riskClass`,
      ).toContain(template.riskClass);
      expect(
        TEMPLATE_CATEGORIES,
        `${template.id}: invalid category`,
      ).toContain(template.category);
    }
  });

  it("keeps outbound HTTP off by default", () => {
    const template = POLICY_TEMPLATES.find(
      (t) => t.id === "block_outbound_http",
    );
    expect(template?.defaultEnabled).toBe(false);
  });

  it("declares the intended secure-default critical templates", () => {
    expect([...CRITICAL_DEFAULT_TEMPLATE_IDS].sort()).toEqual(
      [
        "block_shell_execution",
        "block_file_deletion",
        "block_code_execution",
      ].sort(),
    );
  });

  it("ensures every critical-default template is marked defaultEnabled", () => {
    for (const id of CRITICAL_DEFAULT_TEMPLATE_IDS) {
      const template = POLICY_TEMPLATES.find((t) => t.id === id);
      expect(template, `${id}: must exist`).toBeDefined();
      expect(
        template!.defaultEnabled,
        `${id}: critical defaults must have defaultEnabled=true`,
      ).toBe(true);
    }
  });

  it("excludes block_outbound_http from the critical default set", () => {
    expect(CRITICAL_DEFAULT_TEMPLATE_IDS).not.toContain("block_outbound_http");
  });

  it("getTemplate returns undefined for unknown ids", () => {
    expect(getTemplate("not_a_real_template")).toBeUndefined();
  });

  it("getTemplate returns the matching template", () => {
    const template = getTemplate("block_shell_execution");
    expect(template?.id).toBe("block_shell_execution");
    expect(template?.riskClass).toBe("critical");
    expect(template?.category).toBe("code_execution");
  });

  it("isValidTemplateId narrows to TemplateId for known ids", () => {
    expect(isValidTemplateId("block_shell_execution")).toBe(true);
    expect(isValidTemplateId("nope")).toBe(false);
  });
});
