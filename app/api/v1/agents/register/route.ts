import { NextResponse } from "next/server";
import { authenticatedJsonPost } from "../../../../../src/lib/route-handler.js";
import { validateRegisterAgentBody } from "../../../../../src/middleware/validation.js";
import { normalizeRegisterAgentBody } from "../../../../../src/middleware/normalization.js";
import { registerAgent, type RegisterAgentInput } from "../../../../../src/services/agent-registration.js";

export const POST = authenticatedJsonPost({
  validate: validateRegisterAgentBody,
  normalize: normalizeRegisterAgentBody,
  handler: async ({ auth, body }) => {
    const input: RegisterAgentInput = {
      accountId: auth.accountId,
      body: body as RegisterAgentInput["body"],
    };
    const result = await registerAgent(input);
    return NextResponse.json(result, { status: 200 });
  },
});
