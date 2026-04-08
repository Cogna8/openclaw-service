import { describe, it, expect } from "vitest";
import { generateRawApiKey, hashApiKey } from "../src/lib/api-key-utils.js";

describe("API key utilities", () => {
  it("generateRawApiKey produces key with cg8_sk_ prefix", () => {
    const key = generateRawApiKey();
    expect(key.startsWith("cg8_sk_")).toBe(true);
    expect(key.length).toBeGreaterThan(10);
  });

  it("hashApiKey returns correct structure", () => {
    const raw = generateRawApiKey();
    const result = hashApiKey(raw);
    expect(result).toHaveProperty("lookupHash");
    expect(result).toHaveProperty("secretHash");
    expect(result).toHaveProperty("lastFour");
    expect(result).toHaveProperty("secretPrefix");
  });

  it("lastFour is exactly the last 4 characters of the raw key", () => {
    const raw = generateRawApiKey();
    const result = hashApiKey(raw);
    expect(result.lastFour).toBe(raw.slice(-4));
    expect(result.lastFour.length).toBe(4);
  });

  it("secretPrefix is cg8_sk_", () => {
    const raw = generateRawApiKey();
    const result = hashApiKey(raw);
    expect(result.secretPrefix).toBe("cg8_sk_");
  });

  it("same raw key always produces the same hashes", () => {
    const raw = generateRawApiKey();
    const r1 = hashApiKey(raw);
    const r2 = hashApiKey(raw);
    expect(r1.lookupHash).toBe(r2.lookupHash);
    expect(r1.secretHash).toBe(r2.secretHash);
  });

  it("lookupHash and secretHash are SHA-256 hex strings (64 chars)", () => {
    const raw = generateRawApiKey();
    const result = hashApiKey(raw);
    expect(result.lookupHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.secretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("in V1, lookupHash and secretHash are identical", () => {
    const raw = generateRawApiKey();
    const result = hashApiKey(raw);
    expect(result.lookupHash).toBe(result.secretHash);
  });

  it("different keys produce different hashes", () => {
    const r1 = hashApiKey(generateRawApiKey());
    const r2 = hashApiKey(generateRawApiKey());
    expect(r1.lookupHash).not.toBe(r2.lookupHash);
  });
});
