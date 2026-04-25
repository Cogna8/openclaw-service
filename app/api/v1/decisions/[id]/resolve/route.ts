import { NextResponse } from "next/server";
import { authenticatedParamRoute } from "../../../../../../src/lib/route-handler.js";
import { getDb } from "../../../../../../src/lib/db.js";
import {
  ValidationError,
  NotFoundError,
  GoneError,
} from "../../../../../../src/lib/errors.js";

const VALID_RESOLUTIONS = [
  "allow_once",
  "allow_always",
  "deny",
  "timeout",
  "cancelled",
] as const;

type Resolution = (typeof VALID_RESOLUTIONS)[number];

function validateIdParam(params: { id: string }): void {
  if (!params.id || params.id.trim().length === 0) {
    throw new ValidationError("id is required", "id");
  }

  if (!params.id.startsWith("ev_")) {
    throw new ValidationError("id must have ev_ prefix", "id");
  }
}

export const POST = authenticatedParamRoute<{ id: string }>({
  validate: validateIdParam,
  handler: async ({ req, auth, params }) => {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      throw new ValidationError("Invalid JSON in request body");
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ValidationError("Request body must be a JSON object");
    }

    const resolutionRaw = (body as Record<string, unknown>).resolution;

    if (typeof resolutionRaw !== "string") {
      throw new ValidationError("resolution is required", "resolution");
    }

    if (!VALID_RESOLUTIONS.includes(resolutionRaw as Resolution)) {
      throw new ValidationError(
        `resolution must be one of: ${VALID_RESOLUTIONS.join(", ")}`,
        "resolution",
      );
    }

    const resolution = resolutionRaw as Resolution;
    const db = getDb();

    const event = await db.evaluationEvent.findFirst({
      where: { publicId: params.id, accountId: auth.accountId },
      select: {
        id: true,
        publicId: true,
        decision: true,
        resolution: true,
        resolvedAt: true,
        createdAt: true,
      },
    });

    if (!event || event.decision !== "confirm") {
      throw new NotFoundError("Decision not found");
    }

    const ageMs = Date.now() - event.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      throw new GoneError("Audit window for this decision has closed");
    }

    if (event.resolution === resolution) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (event.resolution !== null) {
      return NextResponse.json(
        { error: "already_resolved", resolution: event.resolution },
        { status: 409 },
      );
    }

    await db.evaluationEvent.update({
      where: { id: event.id },
      data: { resolution, resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  },
});
