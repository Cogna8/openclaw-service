import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }

  toJSON(): Record<string, string> {
    const body: Record<string, string> = {
      error: this.code,
      message: this.message,
    };
    if (this.field) body.field = this.field;
    return body;
  }

  toResponse(): NextResponse {
    return NextResponse.json(this.toJSON(), { status: this.statusCode });
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Invalid or missing API key") {
    super(401, "unauthorized", message);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, field?: string) {
    super(400, "validation_error", message, field);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(404, "not_found", message);
  }
}

export class PayloadTooLargeError extends ApiError {
  constructor(message = "Request body exceeds maximum allowed size") {
    super(413, "payload_too_large", message);
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, message = "Rate limit exceeded") {
    super(429, "rate_limit_exceeded", message);
    this.retryAfter = retryAfter;
  }

  override toResponse(): NextResponse {
    return NextResponse.json(this.toJSON(), {
      status: this.statusCode,
      headers: { "Retry-After": String(this.retryAfter) },
    });
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Resource conflict") {
    super(409, "conflict", message);
  }
}

export class ServerError extends ApiError {
  constructor(message = "Internal server error") {
    super(500, "server_error", message);
  }
}

export class NotImplementedError extends ApiError {
  constructor(message = "This endpoint will be implemented in a future pack") {
    super(501, "not_implemented", message);
  }
}

export function handleApiError(
  error: unknown,
  context?: Record<string, unknown>,
): NextResponse {
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  const detail = {
    event: "unhandled_api_error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  };

  try {
    console.error("[openclaw-service]", JSON.stringify(detail));
  } catch {
    // Fallback if context contains non-serializable values (circular refs etc)
    console.error("[openclaw-service] Unhandled error:", detail.message);
    if (detail.stack) console.error(detail.stack);
  }

  return new ServerError().toResponse();
}
