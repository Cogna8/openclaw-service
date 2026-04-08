import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, type AuthContext } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { parseJsonBody } from "../middleware/validation.js";
import { handleApiError } from "./errors.js";

export type HandlerContext<
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
> = {
  req: NextRequest;
  auth: AuthContext;
  body: TBody;
  query: TQuery;
  params: TParams;
};

export type RouteHandler<
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
> = (ctx: HandlerContext<TBody, TQuery, TParams>) => Promise<NextResponse>;

/**
 * Wrap an authenticated JSON POST route.
 * Runs: auth -> rate limit -> parse body -> validate -> normalize -> handler -> error handling.
 */
export function authenticatedJsonPost<TBody>(opts: {
  validate: (body: Record<string, unknown>) => void;
  normalize: (body: Record<string, unknown>) => Record<string, unknown>;
  handler: RouteHandler<TBody>;
}): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      const auth = await authenticateRequest(req);
      checkRateLimit(auth.apiKeyId);
      const rawBody = (await parseJsonBody(req)) as Record<string, unknown>;
      opts.validate(rawBody);
      const body = opts.normalize(rawBody) as TBody;
      return await opts.handler({ req, auth, body, query: undefined as never, params: undefined as never });
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Wrap an authenticated GET route with query validation.
 * Runs: auth -> rate limit -> validate query -> normalize -> handler -> error handling.
 */
export function authenticatedGet<TQuery>(opts: {
  validate: (params: URLSearchParams) => TQuery;
  normalize: (query: TQuery) => TQuery;
  handler: RouteHandler<undefined, TQuery>;
}): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      const auth = await authenticateRequest(req);
      checkRateLimit(auth.apiKeyId);
      const rawQuery = opts.validate(req.nextUrl.searchParams);
      const query = opts.normalize(rawQuery);
      return await opts.handler({ req, auth, body: undefined, query, params: undefined as never });
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Wrap an authenticated route with a route param (e.g., ruleId).
 * Runs: auth -> rate limit -> validate param -> handler -> error handling.
 */
export function authenticatedParamRoute<TParams>(opts: {
  validate: (params: TParams) => void;
  handler: RouteHandler<undefined, undefined, TParams>;
}): (
  req: NextRequest,
  context: { params: Promise<TParams> },
) => Promise<NextResponse> {
  return async (req: NextRequest, context: { params: Promise<TParams> }) => {
    try {
      const auth = await authenticateRequest(req);
      checkRateLimit(auth.apiKeyId);
      const params = await context.params;
      opts.validate(params);
      return await opts.handler({ req, auth, body: undefined, query: undefined as never, params });
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Wrap an authenticated route with no body, no query, no params.
 * Runs: auth -> rate limit -> handler -> error handling.
 */
export function authenticatedRoute(opts: {
  handler: RouteHandler;
}): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      const auth = await authenticateRequest(req);
      checkRateLimit(auth.apiKeyId);
      return await opts.handler({ req, auth, body: undefined, query: undefined as never, params: undefined as never });
    } catch (error) {
      return handleApiError(error);
    }
  };
}
