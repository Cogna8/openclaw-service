import { NextResponse } from "next/server";
import { NotImplementedError } from "../../../../../src/lib/errors.js";
import { authenticatedJsonPost } from "../../../../../src/lib/route-handler.js";
import { validateRegisterAgentBody } from "../../../../../src/middleware/validation.js";
import { normalizeRegisterAgentBody } from "../../../../../src/middleware/normalization.js";

export const POST = authenticatedJsonPost({
  validate: validateRegisterAgentBody,
  normalize: normalizeRegisterAgentBody,
  handler: async () => {
    return new NotImplementedError(
      "This endpoint will be implemented in Pack 5",
    ).toResponse();
  },
});
