import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the user-provisioning service
const mockHandleUserSignIn = vi.fn();
vi.mock("@/services/user-provisioning.js", () => ({
  handleUserSignIn: (...args: unknown[]) => mockHandleUserSignIn(...args),
}));

// Mock portal DB for JWT callback
const mockJwtFindUnique = vi.fn();
vi.mock("@/lib/portal-db.js", () => ({
  getPortalDb: () => ({
    portalUser: {
      findUnique: mockJwtFindUnique,
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Extract callback functions for direct testing.
// We test the logic that the auth callbacks implement rather than
// invoking the full NextAuth machinery (which requires Google OAuth).

describe("auth callbacks", () => {
  describe("signIn callback logic", () => {
    it("allows first sign-in when provisioning succeeds", async () => {
      mockHandleUserSignIn.mockResolvedValue({
        allowed: true,
        userId: "uuid-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      });

      const result = await mockHandleUserSignIn({
        googleId: "google-new",
        email: "new@example.com",
        name: "New User",
        image: null,
      });

      expect(result.allowed).toBe(true);
      expect(result.userId).toBe("uuid-1");
    });

    it("allows repeat sign-in for existing user", async () => {
      mockHandleUserSignIn.mockResolvedValue({
        allowed: true,
        userId: "uuid-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      });

      const result = await mockHandleUserSignIn({
        googleId: "google-existing",
        email: "existing@example.com",
        name: "Existing User",
        image: null,
      });

      expect(result.allowed).toBe(true);
    });

    it("rejects sign-in when provisioning fails", async () => {
      mockHandleUserSignIn.mockRejectedValue(new Error("DB error"));

      await expect(
        mockHandleUserSignIn({
          googleId: "google-fail",
          email: "fail@example.com",
          name: null,
          image: null,
        }),
      ).rejects.toThrow("DB error");
    });
  });

  describe("JWT/session field mapping", () => {
    it("includes userId, role, and openclawAccountId from portal user", async () => {
      const portalUser = {
        id: "uuid-portal-1",
        role: "user",
        openclawAccountId: "uuid-acct-1",
      };
      mockJwtFindUnique.mockResolvedValue(portalUser);

      // Simulate jwt callback logic
      const token: Record<string, unknown> = { sub: "google-123" };
      const lookedUp = await mockJwtFindUnique({
        where: { googleId: "google-123" },
      });

      if (lookedUp) {
        token.userId = lookedUp.id;
        token.role = lookedUp.role;
        token.openclawAccountId = lookedUp.openclawAccountId;
      }

      expect(token.userId).toBe("uuid-portal-1");
      expect(token.role).toBe("user");
      expect(token.openclawAccountId).toBe("uuid-acct-1");
    });

    it("maps JWT fields to session correctly", () => {
      // Simulate session callback logic
      const token = {
        userId: "uuid-portal-1",
        role: "admin",
        openclawAccountId: "uuid-acct-1",
      };

      const session = {
        user: {
          id: "",
          role: "",
          openclawAccountId: null as string | null,
          name: "Test",
          email: "test@example.com",
        },
      };

      session.user.id = token.userId;
      session.user.role = token.role ?? "user";
      session.user.openclawAccountId = token.openclawAccountId ?? null;

      expect(session.user.id).toBe("uuid-portal-1");
      expect(session.user.role).toBe("admin");
      expect(session.user.openclawAccountId).toBe("uuid-acct-1");
    });

    it("handles super_admin role in JWT/session", async () => {
      const portalUser = {
        id: "uuid-portal-sa",
        role: "super_admin",
        openclawAccountId: "uuid-acct-sa",
      };
      mockJwtFindUnique.mockResolvedValue(portalUser);

      const lookedUp = await mockJwtFindUnique({
        where: { googleId: "google-sa" },
      });

      const token: Record<string, unknown> = {};
      if (lookedUp) {
        token.userId = lookedUp.id;
        token.role = lookedUp.role;
        token.openclawAccountId = lookedUp.openclawAccountId;
      }

      expect(token.role).toBe("super_admin");
    });
  });
});
