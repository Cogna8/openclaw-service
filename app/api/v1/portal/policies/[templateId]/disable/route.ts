import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalRequest } from "../../../../../../../src/middleware/portal-auth.js";
import { disablePolicyForAccount } from "../../../../../../../src/services/policy-crud.js";
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

    const result = await disablePolicyForAccount({
      accountId: auth.accountId,
      templateId,
      actorUserId: auth.userId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error, {
      route: "POST /api/v1/portal/policies/:templateId/disable",
      templateId,
      accountId: auth?.accountId,
      userId: auth?.userId,
    });
  }
}
