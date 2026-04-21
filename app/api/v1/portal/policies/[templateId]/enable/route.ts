import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalRequest } from "../../../../../../../src/middleware/portal-auth.js";
import { enablePolicyForAccount } from "../../../../../../../src/services/policy-crud.js";
import { handleApiError } from "../../../../../../../src/lib/errors.js";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  let auth: Awaited<ReturnType<typeof authenticatePortalRequest>> | undefined;
  let templateId: string | undefined;

  try {
    auth = await authenticatePortalRequest(req);
    ({ templateId } = await context.params);

    const result = await enablePolicyForAccount({
      accountId: auth.accountId,
      templateId,
      actorUserId: auth.userId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error, {
      route: "POST /api/v1/portal/policies/:templateId/enable",
      templateId,
      accountId: auth?.accountId,
      userId: auth?.userId,
    });
  }
}
