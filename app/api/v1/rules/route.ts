import { NextResponse } from "next/server";
import {
  authenticatedJsonPost,
  authenticatedGet,
} from "../../../../src/lib/route-handler.js";
import {
  validateCreateRuleBody,
  validateRulesQuery,
} from "../../../../src/middleware/validation.js";
import {
  normalizeCreateRuleBody,
  normalizeRulesQuery,
} from "../../../../src/middleware/normalization.js";
import { createRule, listRules } from "../../../../src/services/rule-crud.js";

export const POST = authenticatedJsonPost({
  validate: validateCreateRuleBody,
  normalize: normalizeCreateRuleBody,
  handler: async ({ auth, body }) => {
    const b = body as { agent_id: string; type: string; spec: Record<string, unknown> };
    const result = await createRule({
      accountId: auth.accountId,
      apiKeyId: auth.apiKeyId,
      agentPublicId: b.agent_id,
      type: b.type as any,
      spec: b.spec,
    });
    return NextResponse.json(result, { status: 201 });
  },
});

export const GET = authenticatedGet({
  validate: validateRulesQuery,
  normalize: normalizeRulesQuery,
  handler: async ({ auth, query }) => {
    const result = await listRules({
      accountId: auth.accountId,
      agentPublicId: query.agent_id,
      status: query.status as any,
    });
    return NextResponse.json(result, { status: 200 });
  },
});
