import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { handleUserSignIn } from "@/services/user-provisioning";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      openclawAccountId: string | null;
    } & DefaultSession["user"];
  }
}

// JWT fields are accessed via type assertions in callbacks below.
// Module augmentation for next-auth/jwt is not needed with bundler resolution.

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ account, profile }) {
      if (account?.provider !== "google" || !profile?.sub || !profile?.email) {
        return false;
      }

      try {
        const result = await handleUserSignIn({
          googleId: profile.sub,
          email: profile.email,
          name: (profile.name as string) ?? null,
          image: (profile.picture as string) ?? null,
        });

        return result.allowed;
      } catch (error) {
        console.error("Sign-in provisioning failed:", error);
        return false;
      }
    },

    async jwt({ token, profile, trigger }) {
      if (trigger === "signIn" && profile?.sub) {
        const { getPortalDb } = await import("@/lib/portal-db");
        const db = getPortalDb();
        const portalUser = await db.portalUser.findUnique({
          where: { googleId: profile.sub },
        });
        if (portalUser) {
          token.userId = portalUser.id;
          token.role = portalUser.role;
          token.openclawAccountId = portalUser.openclawAccountId;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) ?? "user";
        session.user.openclawAccountId =
          (token.openclawAccountId as string | null) ?? null;
      }
      return session;
    },
  },
});
