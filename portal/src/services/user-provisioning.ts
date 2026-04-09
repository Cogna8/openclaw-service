import { getPortalDb } from "@/lib/portal-db";
import { createOpenClawAccount } from "@/lib/openclaw-db";
import { generateAccountId } from "@/lib/ids";

const SUPER_ADMIN_EMAIL = "admin@cogna8.io";

export interface SignInResult {
  allowed: boolean;
  userId?: string;
  role?: string;
  openclawAccountId?: string | null;
}

export async function handleUserSignIn(params: {
  googleId: string;
  email: string;
  name: string | null;
  image: string | null;
}): Promise<SignInResult> {
  const { googleId, email, name, image } = params;
  const db = getPortalDb();
  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  const existing = await db.portalUser.findUnique({
    where: { googleId },
  });

  if (existing) {
    // Blocked users are rejected, but super-admin can never be blocked
    if (existing.isBlocked && !isSuperAdmin) {
      return { allowed: false };
    }

    // Re-enforce super-admin role on every sign-in; update lastLoginAt
    const role = isSuperAdmin ? "super_admin" : existing.role;
    const updated = await db.portalUser.update({
      where: { id: existing.id },
      data: { lastLoginAt: new Date(), role },
    });

    return {
      allowed: true,
      userId: updated.id,
      role: updated.role,
      openclawAccountId: updated.openclawAccountId,
    };
  }

  // --- First sign-in: provision OpenClaw account first, then create portal user ---
  const publicId = generateAccountId();
  const serviceAccount = await createOpenClawAccount(publicId);

  const role = isSuperAdmin ? "super_admin" : "user";

  const portalUser = await db.portalUser.create({
    data: {
      email,
      name,
      image,
      role,
      googleId,
      openclawAccountId: serviceAccount.id,
      lastLoginAt: new Date(),
    },
  });

  return {
    allowed: true,
    userId: portalUser.id,
    role: portalUser.role,
    openclawAccountId: portalUser.openclawAccountId,
  };
}
