import { describe, it, expect } from "vitest";
import {
  ApiError,
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitError,
  ConflictError,
  ServerError,
  NotImplementedError,
  handleApiError,
} from "../src/lib/errors.js";

describe("error model", () => {
  it("ApiError produces correct JSON", () => {
    const err = new ApiError(400, "test_error", "test message", "field.path");
    expect(err.toJSON()).toEqual({
      error: "test_error",
      message: "test message",
      field: "field.path",
    });
  });

  it("ApiError without field omits it from JSON", () => {
    const err = new ApiError(400, "test_error", "test message");
    const json = err.toJSON();
    expect(json).not.toHaveProperty("field");
  });

  it("UnauthorizedError returns 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("unauthorized");
  });

  it("ValidationError returns 400", () => {
    const err = new ValidationError("bad input", "field");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("validation_error");
    expect(err.field).toBe("field");
  });

  it("NotFoundError returns 404", () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it("PayloadTooLargeError returns 413", () => {
    const err = new PayloadTooLargeError();
    expect(err.statusCode).toBe(413);
  });

  it("RateLimitError returns 429 with Retry-After", () => {
    const err = new RateLimitError(30);
    expect(err.statusCode).toBe(429);
    const response = err.toResponse();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("ConflictError returns 409", () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });

  it("ServerError returns 500", () => {
    const err = new ServerError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("server_error");
  });

  it("NotImplementedError returns 501", () => {
    const err = new NotImplementedError();
    expect(err.statusCode).toBe(501);
    expect(err.code).toBe("not_implemented");
  });
});

describe("handleApiError", () => {
  it("returns structured response for known ApiError", async () => {
    const err = new ValidationError("bad field", "name");
    const response = handleApiError(err);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("validation_error");
    expect(body.field).toBe("name");
  });

  it("returns 500 for unknown errors", async () => {
    const response = handleApiError(new Error("unexpected"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("server_error");
  });

  it("returns 500 for non-Error values", async () => {
    const response = handleApiError("just a string");
    expect(response.status).toBe(500);
  });
});
