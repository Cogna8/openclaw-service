import { NextRequest, NextResponse } from "next/server";
import { authenticatePortalRequest } from "../../../../../src/middleware/portal-auth.js";
import { listPoliciesForAccount } from "../../../../../src/services/policy-crud.js";
import { handleApiError } from "../../../../../src/lib/errors.js";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticatePortalRequest(req);
    const policies = await listPoliciesForAccount(auth.accountId);
    return NextResponse.json({ policies }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
