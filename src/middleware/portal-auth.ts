import { NextRequest } from "next/server";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * Portal-to-service authentication. Used for endpoints the portal calls
 * directly on behalf of signed-in users.
 *
 * Shape:
 *   Header:  X-Cg8-Portal-Token: <shared secret>
 *   Header:  X-Cg8-Account-Id: <accounts.id UUID>
 *   Header:  X-Cg8-User-Id:    <portal user id, optional>
 *
 * The portal is responsible for resolving the authenticated session into the
 * correct account_id before making the call. The service trusts the header
 * only because the shared secret is verified.
 *
 * The shared secret lives in env CG8_PORTAL_SERVICE_TOKEN. It must be set on
 * both the portal and service Vercel projects to the same value.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PortalAuthContext = {
  accountId: string;
  userId: string | null;
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function authenticatePortalRequest(
  req: NextRequest,
): Promise<PortalAuthContext> {
  const expected = process.env.CG8_PORTAL_SERVICE_TOKEN;
  if (!expected) {
    // Intentional: if the server isn't configured with the shared secret,
    // ALL portal calls are rejected. Fail closed.
    throw new UnauthorizedError();
  }

  const presented = req.headers.get("x-cg8-portal-token");
  if (!presented) throw new UnauthorizedError();
  if (!constantTimeEqual(presented, expected)) throw new UnauthorizedError();

  const accountId = req.headers.get("x-cg8-account-id");
  if (!accountId || !UUID_RE.test(accountId)) {
    throw new UnauthorizedError();
  }

  const userIdHeader = req.headers.get("x-cg8-user-id");
  const userId = userIdHeader && userIdHeader.length > 0 ? userIdHeader : null;

  return { accountId, userId };
}
