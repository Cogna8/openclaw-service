import { NextResponse } from "next/server";
import { authenticatedRoute } from "../../../../src/lib/route-handler.js";
import { getAccountStatus } from "../../../../src/services/account-status.js";

export const GET = authenticatedRoute({
  handler: async ({ auth }) => {
    const result = await getAccountStatus(auth.accountId);
    return NextResponse.json(result, { status: 200 });
  },
});
