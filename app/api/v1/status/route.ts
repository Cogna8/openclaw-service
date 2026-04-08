import { NextResponse } from "next/server";
import { NotImplementedError } from "../../../../src/lib/errors.js";
import { authenticatedRoute } from "../../../../src/lib/route-handler.js";

export const GET = authenticatedRoute({
  handler: async () => {
    return new NotImplementedError(
      "This endpoint will be implemented in Pack 5",
    ).toResponse();
  },
});
