import { describe, it, expect } from "vitest";
import {
  generateAccountId,
  generateApiKeyId,
  generateAgentId,
  generateRuleId,
  generateEvaluationId,
} from "../src/lib/ids.js";

describe("ID generation", () => {
  it("generateAccountId produces acct_ prefix with 8-char alphanumeric suffix", () => {
    const id = generateAccountId();
    expect(id).toMatch(/^acct_[A-Za-z0-9]{8}$/);
  });

  it("generateApiKeyId produces key_ prefix", () => {
    const id = generateApiKeyId();
    expect(id).toMatch(/^key_[A-Za-z0-9]{8}$/);
  });

  it("generateAgentId produces agt_ prefix", () => {
    const id = generateAgentId();
    expect(id).toMatch(/^agt_[A-Za-z0-9]{8}$/);
  });

  it("generateRuleId produces rl_ prefix", () => {
    const id = generateRuleId();
    expect(id).toMatch(/^rl_[A-Za-z0-9]{8}$/);
  });

  it("generateEvaluationId produces ev_ prefix", () => {
    const id = generateEvaluationId();
    expect(id).toMatch(/^ev_[A-Za-z0-9]{8}$/);
  });

  it("generates unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateAccountId()));
    expect(ids.size).toBe(100);
  });
});
