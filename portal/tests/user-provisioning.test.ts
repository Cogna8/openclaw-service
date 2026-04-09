import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock portal DB
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/portal-db.js", () => ({
  getPortalDb: () => ({
    portalUser: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  }),
}));

// Mock openclaw DB
const mockCreateOpenClawAccount = vi.fn();
vi.mock("@/lib/openclaw-db.js", () => ({
  createOpenClawAccount: (...args: unknown[]) =>
    mockCreateOpenClawAccount(...args),
}));

// Mock ID generation
vi.mock("@/lib/ids.js", () => ({
  generateAccountId: () => "acct_test1234",
}));

import { handleUserSignIn } from "../src/services/user-provisioning.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleUserSignIn", () => {
  const newUserParams = {
    googleId: "google-123",
    email: "user@example.com",
    name: "Test User",
    image: "https://example.com/photo.jpg",
  };

  describe("new user", () => {
    it("creates PortalUser on first sign-in", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreateOpenClawAccount.mockResolvedValue({
        id: "uuid-acct-1",
        publicId: "acct_test1234",
      });
      mockCreate.mockResolvedValue({
        id: "uuid-portal-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      });

      const result = await handleUserSignIn(newUserParams);

      expect(result.allowed).toBe(true);
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate.mock.calls[0][0].data.email).toBe("user@example.com");
      expect(mockCreate.mock.calls[0][0].data.googleId).toBe("google-123");
    });

    it("provisions OpenClaw account on first sign-in", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreateOpenClawAccount.mockResolvedValue({
        id: "uuid-acct-1",
        publicId: "acct_test1234",
      });
      mockCreate.mockResolvedValue({
        id: "uuid-portal-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      });

      await handleUserSignIn(newUserParams);

      expect(mockCreateOpenClawAccount).toHaveBeenCalledWith("acct_test1234");
    });

    it("stores openclawAccountId on the portal user", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreateOpenClawAccount.mockResolvedValue({
        id: "uuid-acct-1",
        publicId: "acct_test1234",
      });
      mockCreate.mockResolvedValue({
        id: "uuid-portal-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      });

      const result = await handleUserSignIn(newUserParams);

      expect(result.openclawAccountId).toBe("uuid-acct-1");
      expect(mockCreate.mock.calls[0][0].data.openclawAccountId).toBe(
        "uuid-acct-1",
      );
    });
  });

  describe("super-admin enforcement", () => {
    it("assigns super_admin role to admin@cogna8.io on first sign-in", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreateOpenClawAccount.mockResolvedValue({
        id: "uuid-acct-sa",
        publicId: "acct_test1234",
      });
      mockCreate.mockResolvedValue({
        id: "uuid-portal-sa",
        role: "super_admin",
        openclawAccountId: "uuid-acct-sa",
      });

      const result = await handleUserSignIn({
        ...newUserParams,
        email: "admin@cogna8.io",
      });

      expect(result.role).toBe("super_admin");
      expect(mockCreate.mock.calls[0][0].data.role).toBe("super_admin");
    });

    it("re-enforces super_admin role on repeated sign-ins", async () => {
      mockFindUnique.mockResolvedValue({
        id: "uuid-portal-sa",
        email: "admin@cogna8.io",
        role: "user", // somehow downgraded
        isBlocked: false,
        openclawAccountId: "uuid-acct-sa",
      });
      mockUpdate.mockResolvedValue({
        id: "uuid-portal-sa",
        role: "super_admin",
        openclawAccountId: "uuid-acct-sa",
      });

      const result = await handleUserSignIn({
        ...newUserParams,
        email: "admin@cogna8.io",
      });

      expect(result.role).toBe("super_admin");
      expect(mockUpdate.mock.calls[0][0].data.role).toBe("super_admin");
    });

    it("cannot block super-admin in sign-in flow", async () => {
      mockFindUnique.mockResolvedValue({
        id: "uuid-portal-sa",
        email: "admin@cogna8.io",
        role: "super_admin",
        isBlocked: true,
        openclawAccountId: "uuid-acct-sa",
      });
      mockUpdate.mockResolvedValue({
        id: "uuid-portal-sa",
        role: "super_admin",
        openclawAccountId: "uuid-acct-sa",
      });

      const result = await handleUserSignIn({
        ...newUserParams,
        email: "admin@cogna8.io",
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe("existing user", () => {
    it("updates lastLoginAt on repeat sign-in", async () => {
      mockFindUnique.mockResolvedValue({
        id: "uuid-portal-1",
        email: "user@example.com",
        role: "user",
        isBlocked: false,
        openclawAccountId: "uuid-acct-1",
      });
      mockUpdate.mockResolvedValue({
        id: "uuid-portal-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      });

      const result = await handleUserSignIn(newUserParams);

      expect(result.allowed).toBe(true);
      expect(mockUpdate).toHaveBeenCalledOnce();
      expect(mockUpdate.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
    });

    it("rejects blocked user", async () => {
      mockFindUnique.mockResolvedValue({
        id: "uuid-portal-blocked",
        email: "blocked@example.com",
        role: "user",
        isBlocked: true,
        openclawAccountId: "uuid-acct-blocked",
      });

      const result = await handleUserSignIn({
        ...newUserParams,
        email: "blocked@example.com",
      });

      expect(result.allowed).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
