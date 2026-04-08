import { NextResponse } from "next/server";
import { NotImplementedError } from "../../../../../src/lib/errors.js";
import { authenticatedParamRoute } from "../../../../../src/lib/route-handler.js";
import { validateRuleIdParam } from "../../../../../src/middleware/validation.js";

export const DELETE = authenticatedParamRoute<{ ruleId: string }>({
  validate: (params) => validateRuleIdParam(params.ruleId),
  handler: async () => {
    return new NotImplementedError(
      "This endpoint will be implemented in Pack 4",
    ).toResponse();
  },
});
