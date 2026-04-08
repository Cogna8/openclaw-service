import { NextResponse } from "next/server";
import { NotImplementedError } from "../../../../src/lib/errors.js";
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

export const POST = authenticatedJsonPost({
  validate: validateCreateRuleBody,
  normalize: normalizeCreateRuleBody,
  handler: async () => {
    return new NotImplementedError(
      "This endpoint will be implemented in Pack 4",
    ).toResponse();
  },
});

export const GET = authenticatedGet({
  validate: validateRulesQuery,
  normalize: normalizeRulesQuery,
  handler: async () => {
    return new NotImplementedError(
      "This endpoint will be implemented in Pack 4",
    ).toResponse();
  },
});
