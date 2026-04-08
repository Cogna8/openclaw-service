import { NextResponse } from "next/server";
import { authenticatedJsonPost } from "../../../../src/lib/route-handler.js";
import { validateEvaluateBody } from "../../../../src/middleware/validation.js";
import { normalizeEvaluateBody } from "../../../../src/middleware/normalization.js";
import { evaluateHotPath, type EvaluateInput } from "../../../../src/services/evaluate.js";

export const POST = authenticatedJsonPost({
  validate: validateEvaluateBody,
  normalize: normalizeEvaluateBody,
  handler: async ({ auth, body }) => {
    const input: EvaluateInput = {
      accountId: auth.accountId,
      apiKeyId: auth.apiKeyId,
      body: body as EvaluateInput["body"],
    };
    const result = await evaluateHotPath(input);
    return NextResponse.json(result, { status: 200 });
  },
});
