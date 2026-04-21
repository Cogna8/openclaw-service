import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalRequest } from "../../../../../../../src/middleware/portal-auth.js";
import { enablePolicyForAccount } from "../../../../../../../src/services/policy-crud.js";
import { handleApiError } from "../../../../../../../src/lib/errors.js";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticatePortalRequest(req);
    const { templateId } = await context.params;
    const result = await enablePolicyForAccount({
      accountId: auth.accountId,
      templateId,
      actorUserId: auth.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
