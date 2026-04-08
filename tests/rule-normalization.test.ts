import { describe, it, expect } from "vitest";
import {
  trimWhitespace,
  lowercaseEnumValues,
  lowercaseEmail,
  normalizePath,
  buildTargetValueNormalized,
  buildNormalizedFingerprint,
} from "../src/lib/rule-normalization.js";

describe("trimWhitespace", () => {
  it("trims leading and trailing whitespace", () => {
    expect(trimWhitespace("  hello  ")).toBe("hello");
  });
});

describe("lowercaseEnumValues", () => {
  it("lowercases enum-like values", () => {
    expect(lowercaseEnumValues("BLOCK")).toBe("block");
    expect(lowercaseEnumValues("Confirm")).toBe("confirm");
  });
});

describe("lowercaseEmail", () => {
  it("lowercases and trims email", () => {
    expect(lowercaseEmail("  Sarah@Example.COM  ")).toBe("sarah@example.com");
  });
});

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("C:\\Users\\test\\file.txt")).toBe("C:/Users/test/file.txt");
  });

  it("leaves forward slashes unchanged", () => {
    expect(normalizePath("/home/user/.ssh/*")).toBe("/home/user/.ssh/*");
  });
});

describe("buildTargetValueNormalized", () => {
  it("normalizes sender (email) targets", () => {
    expect(buildTargetValueNormalized("sender", "  Sarah@Example.COM  ")).toBe(
      "sarah@example.com",
    );
  });

  it("normalizes path targets with backslash conversion", () => {
    expect(buildTargetValueNormalized("path", "C:\\Users\\.ssh\\*")).toBe(
      "c:/users/.ssh/*",
    );
  });

  it("normalizes resource_id targets", () => {
    expect(buildTargetValueNormalized("resource_id", "  MyResource  ")).toBe(
      "myresource",
    );
  });
});

describe("buildNormalizedFingerprint", () => {
  it("produces correct fingerprint for block rule", () => {
    expect(
      buildNormalizedFingerprint({ type: "block", toolMatch: "exec" }),
    ).toBe("block:exec");
  });

  it("produces correct fingerprint for confirm rule", () => {
    expect(
      buildNormalizedFingerprint({ type: "confirm", toolMatch: "file_delete" }),
    ).toBe("confirm:file_delete");
  });

  it("produces correct fingerprint for exclude rule", () => {
    expect(
      buildNormalizedFingerprint({
        type: "exclude",
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValue: "sarah@example.com",
      }),
    ).toBe("exclude:email_archive:sender:sarah@example.com");
  });

  it("produces correct fingerprint for protect rule", () => {
    expect(
      buildNormalizedFingerprint({
        type: "protect",
        targetKind: "path",
        targetValue: "/home/user/.ssh/*",
      }),
    ).toBe("protect:path:/home/user/.ssh/*");
  });

  it("produces correct fingerprint for threshold rule", () => {
    expect(
      buildNormalizedFingerprint({
        type: "threshold",
        toolMatch: "file_delete",
        thresholdMax: 10,
        thresholdPeriod: "session",
      }),
    ).toBe("threshold:file_delete:10:session");
  });

  it("is deterministic - same input produces same output", () => {
    const input = {
      type: "exclude" as const,
      toolMatch: "email_archive",
      targetKind: "sender" as const,
      targetValue: "Test@Example.COM",
    };
    const fp1 = buildNormalizedFingerprint(input);
    const fp2 = buildNormalizedFingerprint(input);
    expect(fp1).toBe(fp2);
  });

  it("normalizes email in exclude fingerprint", () => {
    expect(
      buildNormalizedFingerprint({
        type: "exclude",
        toolMatch: "email_archive",
        targetKind: "sender",
        targetValue: "  Sarah@Example.COM  ",
      }),
    ).toBe("exclude:email_archive:sender:sarah@example.com");
  });

  it("normalizes path in protect fingerprint", () => {
    expect(
      buildNormalizedFingerprint({
        type: "protect",
        targetKind: "path",
        targetValue: "C:\\Users\\.ssh\\*",
      }),
    ).toBe("protect:path:c:/users/.ssh/*");
  });
});
