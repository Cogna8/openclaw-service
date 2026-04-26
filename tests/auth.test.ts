import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticateRequest } from "../src/middleware/auth.js";
import { UnauthorizedError } from "../src/lib/errors.js";

// Mock getDb
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    apiKey: {
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
  }),
}));

function makeRequest(authHeader?: string): any {
  return {
    headers: {
      get: (name: string) => {
        if (name === "authorization") return authHeader ?? null;
        return null;
      },
    },
  };
}

describe("authenticateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthorizedError when no auth header", async () => {
    await expect(authenticateRequest(makeRequest())).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("throws UnauthorizedError for malformed bearer header", async () => {
    await expect(
      authenticateRequest(makeRequest("Basic abc123")),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for bearer with no token", async () => {
    await expect(
      authenticateRequest(makeRequest("Bearer ")),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for bearer with multiple spaces", async () => {
    await expect(
      authenticateRequest(makeRequest("Bearer token extra")),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when key not found (invalid key)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(
      authenticateRequest(makeRequest("Bearer cg8_sk_invalid_key")),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for revoked key (query filters by active status)", async () => {
    // The query filters by status: "active", so a revoked key returns null
    mockFindFirst.mockResolvedValue(null);
    await expect(
      authenticateRequest(makeRequest("Bearer cg8_sk_revoked_key")),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("resolves auth context for valid active key", async () => {
    mockFindFirst.mockResolvedValue({
      id: "uuid-internal-id",
      publicId: "key_abc12345",
      accountId: "acct_xyz",
      account: { capabilityFlags: {} },
    });
    const ctx = await authenticateRequest(
      makeRequest("Bearer cg8_sk_valid_key_here"),
    );
    expect(ctx).toEqual({
      accountId: "acct_xyz",
      apiKeyId: "uuid-internal-id",
      publicKeyId: "key_abc12345",
      account: { capabilityFlags: {} },
    });
  });

  it("queries DB with lookupHash from hashApiKey", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      publicId: "key_abc12345",
      accountId: "acct_xyz",
      account: { capabilityFlags: {} },
    });
    await authenticateRequest(makeRequest("Bearer cg8_sk_test_token"));
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { lookupHash: expect.any(String), status: "active" },
      select: {
        id: true,
        publicId: true,
        accountId: true,
        account: { select: { capabilityFlags: true } },
      },
    });
  });

  it("updates lastUsedAt asynchronously", async () => {
    mockFindFirst.mockResolvedValue({
      id: 42,
      publicId: "key_abc12345",
      accountId: "acct_xyz",
      account: { capabilityFlags: {} },
    });
    await authenticateRequest(makeRequest("Bearer cg8_sk_test_token"));
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("does not fail if lastUsedAt update fails", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      publicId: "key_abc12345",
      accountId: "acct_xyz",
      account: { capabilityFlags: {} },
    });
    mockUpdate.mockRejectedValue(new Error("DB error"));
    // Should not throw despite update failure
    const ctx = await authenticateRequest(
      makeRequest("Bearer cg8_sk_valid_key_here"),
    );
    expect(ctx.accountId).toBe("acct_xyz");
  });

  it("exposes capabilityFlags on auth context for bench account", async () => {
    mockFindFirst.mockResolvedValue({
      id: "uuid-internal-id",
      publicId: "key_bench1",
      accountId: "acct_bench",
      account: { capabilityFlags: { benchAccount: true } },
    });
    const ctx = await authenticateRequest(
      makeRequest("Bearer cg8_sk_bench_key"),
    );
    expect(ctx.account.capabilityFlags).toEqual({ benchAccount: true });
  });

  it("coerces null capabilityFlags to empty object", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      publicId: "key_abc12345",
      accountId: "acct_xyz",
      account: { capabilityFlags: null },
    });
    const ctx = await authenticateRequest(
      makeRequest("Bearer cg8_sk_test_token"),
    );
    expect(ctx.account.capabilityFlags).toEqual({});
  });
});
