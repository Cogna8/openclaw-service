import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalRequest } from "../../../../../../src/middleware/portal-auth.js";
import { applySecureDefaultsForAccount } from "../../../../../../src/services/policy-crud.js";
import { handleApiError } from "../../../../../../src/lib/errors.js";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let auth: Awaited<ReturnType<typeof authenticatePortalRequest>> | undefined;

  try {
    auth = await authenticatePortalRequest(req);
    const result = await applySecureDefaultsForAccount({
      accountId: auth.accountId,
      actorUserId: auth.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error, {
      route: "POST /api/v1/portal/policies/secure-defaults",
      accountId: auth?.accountId,
      userId: auth?.userId,
    });
  }
}
