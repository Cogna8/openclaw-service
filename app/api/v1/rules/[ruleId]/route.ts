import { NextResponse } from "next/server";
import { authenticatedParamRoute } from "../../../../../src/lib/route-handler.js";
import { validateRuleIdParam } from "../../../../../src/middleware/validation.js";
import { removeRule } from "../../../../../src/services/rule-crud.js";

export const DELETE = authenticatedParamRoute<{ ruleId: string }>({
  validate: (params) => validateRuleIdParam(params.ruleId),
  handler: async ({ auth, params }) => {
    const result = await removeRule(auth.accountId, params.ruleId, auth.apiKeyId);
    return NextResponse.json(result, { status: 200 });
  },
});
