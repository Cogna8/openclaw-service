import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalRequest } from "../../../../../../src/middleware/portal-auth.js";
import { deleteTemplateRule } from "../../../../../../src/services/policy-crud.js";
import { handleApiError } from "../../../../../../src/lib/errors.js";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ rulePublicId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticatePortalRequest(req);
    const { rulePublicId } = await context.params;
    const result = await deleteTemplateRule({
      accountId: auth.accountId,
      rulePublicId,
      actorUserId: auth.userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
