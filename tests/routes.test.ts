import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock getDb for auth
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});
const mockEvaluationEventFindFirst = vi.fn();
const mockEvaluationEventUpdate = vi.fn();

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    apiKey: {
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
    evaluationEvent: {
      findFirst: mockEvaluationEventFindFirst,
      update: mockEvaluationEventUpdate,
    },
  }),
}));

// Import after mocking
import { _resetRateLimitState } from "../src/middleware/rate-limit.js";

function authedHeaders(contentType?: string): Record<string, string> {
  const h: Record<string, string> = {
    authorization: "Bearer cg8_sk_test_key_for_routes",
  };
  if (contentType) h["content-type"] = contentType;
  return h;
}

function makeUrl(path: string): string {
  return `http://localhost:3000${path}`;
}

describe("route existence and middleware pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitState();
    mockFindFirst.mockResolvedValue({
      id: 1,
      publicId: "key_test1234",
      accountId: "acct_test",
    });
  });

  describe("GET / (health check)", () => {
    it("returns 200 with service info (no auth required)", async () => {
      const { GET } = await import("../app/route.js");
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.service).toBe("cogna8-openclaw-eval-service");
      expect(body.status).toBe("ok");
    });
  });

  describe("unauthenticated requests return 401", () => {
    it("POST /v1/evaluate without auth -> 401", async () => {
      const { POST } = await import("../app/api/v1/evaluate/route.js");
      const req = new NextRequest(makeUrl("/api/v1/evaluate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent_id: "a", session: { id: "s" }, tool_call: { tool_name: "t" } }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("GET /v1/status without auth -> 401", async () => {
      const { GET } = await import("../app/api/v1/status/route.js");
      const req = new NextRequest(makeUrl("/api/v1/status"));
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("locked endpoints return 501 with valid auth", () => {
    it("POST /v1/evaluate -> no longer 501 (Pack 3 implemented)", async () => {
      const { POST } = await import("../app/api/v1/evaluate/route.js");
      const req = new NextRequest(makeUrl("/api/v1/evaluate"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: JSON.stringify({
          agent_id: "agt_test",
          session: { id: "sess-1" },
          tool_call: { tool_name: "read_file" },
        }),
      });
      const res = await POST(req);
      // Endpoint is now live; without full DB mock it returns 500 (not 501)
      expect(res.status).not.toBe(501);
    });

    it("POST /v1/rules -> no longer 501 (Pack 4 implemented)", async () => {
      const { POST } = await import("../app/api/v1/rules/route.js");
      const req = new NextRequest(makeUrl("/api/v1/rules"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: JSON.stringify({
          agent_id: "agt_test",
          type: "block",
          spec: { tool: "rm" },
        }),
      });
      const res = await POST(req);
      expect(res.status).not.toBe(501);
    });

    it("GET /v1/rules -> no longer 501 (Pack 4 implemented)", async () => {
      const { GET } = await import("../app/api/v1/rules/route.js");
      const req2 = new NextRequest(
        makeUrl("/api/v1/rules?agent_id=agt_test"),
        { headers: authedHeaders() },
      );
      const res = await GET(req2);
      expect(res.status).not.toBe(501);
    });

    it("DELETE /v1/rules/:ruleId -> no longer 501 (Pack 4 implemented)", async () => {
      const { DELETE } = await import(
        "../app/api/v1/rules/[ruleId]/route.js"
      );
      const req = new NextRequest(
        makeUrl("/api/v1/rules/rl_test1234"),
        { method: "DELETE", headers: authedHeaders() },
      );
      const res = await DELETE(req, {
        params: Promise.resolve({ ruleId: "rl_test1234" }),
      });
      expect(res.status).not.toBe(501);
    });

    it("POST /v1/rules/:ruleId/enable -> no longer 501 (Pack 4 implemented)", async () => {
      const { POST } = await import(
        "../app/api/v1/rules/[ruleId]/enable/route.js"
      );
      const req = new NextRequest(
        makeUrl("/api/v1/rules/rl_test1234/enable"),
        { method: "POST", headers: authedHeaders() },
      );
      const res = await POST(req, {
        params: Promise.resolve({ ruleId: "rl_test1234" }),
      });
      expect(res.status).not.toBe(501);
    });

    it("POST /v1/rules/:ruleId/disable -> no longer 501 (Pack 4 implemented)", async () => {
      const { POST } = await import(
        "../app/api/v1/rules/[ruleId]/disable/route.js"
      );
      const req = new NextRequest(
        makeUrl("/api/v1/rules/rl_test1234/disable"),
        { method: "POST", headers: authedHeaders() },
      );
      const res = await POST(req, {
        params: Promise.resolve({ ruleId: "rl_test1234" }),
      });
      expect(res.status).not.toBe(501);
    });

    it("POST /v1/agents/register -> no longer 501 (Pack 5 implemented)", async () => {
      const { POST } = await import(
        "../app/api/v1/agents/register/route.js"
      );
      const req = new NextRequest(makeUrl("/api/v1/agents/register"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: JSON.stringify({
          agent: { external_id: "ext-1", name: "Test" },
          tools: [{ name: "read_file" }],
          catalog_hash: "abc123",
        }),
      });
      const res = await POST(req);
      // Endpoint is now live; without full DB mock it returns 500 (not 501)
      expect(res.status).not.toBe(501);
    });

    it("GET /v1/status -> no longer 501 (Pack 5 implemented)", async () => {
      const { GET } = await import("../app/api/v1/status/route.js");
      const req = new NextRequest(makeUrl("/api/v1/status"), {
        headers: authedHeaders(),
      });
      const res = await GET(req);
      // Endpoint is now live; without full DB mock it returns 500 (not 501)
      expect(res.status).not.toBe(501);
    });
  });

  describe("validation errors through pipeline", () => {
    it("invalid JSON returns 400", async () => {
      const { POST } = await import("../app/api/v1/evaluate/route.js");
      const req = new NextRequest(makeUrl("/api/v1/evaluate"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: "{bad json}",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("oversize body returns 413", async () => {
      const { POST } = await import("../app/api/v1/evaluate/route.js");
      const req = new NextRequest(makeUrl("/api/v1/evaluate"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: JSON.stringify({ data: "x".repeat(9000) }),
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
    });

    it("unknown top-level field returns 400", async () => {
      const { POST } = await import("../app/api/v1/evaluate/route.js");
      const req = new NextRequest(makeUrl("/api/v1/evaluate"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: JSON.stringify({
          agent_id: "agt_test",
          session: { id: "s" },
          tool_call: { tool_name: "t" },
          unknown_field: true,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("validation_error");
    });

    it("missing required field returns 400 with field", async () => {
      const { POST } = await import("../app/api/v1/evaluate/route.js");
      const req = new NextRequest(makeUrl("/api/v1/evaluate"), {
        method: "POST",
        headers: authedHeaders("application/json"),
        body: JSON.stringify({
          session: { id: "s" },
          tool_call: { tool_name: "t" },
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.field).toBe("agent_id");
    });
  });

  describe("rate limiting through pipeline", () => {
    it("returns 429 on 101st request", async () => {
      const { GET } = await import("../app/api/v1/status/route.js");

      for (let i = 0; i < 100; i++) {
        const req = new NextRequest(makeUrl("/api/v1/status"), {
          headers: authedHeaders(),
        });
        const res = await GET(req);
        expect(res.status).not.toBe(429); // passes rate limit, handled by endpoint
      }

      const req = new NextRequest(makeUrl("/api/v1/status"), {
        headers: authedHeaders(),
      });
      const res = await GET(req);
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe("rate_limit_exceeded");
    });
  });
});

describe("POST /api/v1/decisions/:id/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitState();
    mockFindFirst.mockResolvedValue({
      id: "key-uuid",
      publicId: "key_1234",
      accountId: "acct-uuid",
    });
  });

  function makeReq(body: unknown): NextRequest {
    return new NextRequest(makeUrl("/api/v1/decisions/ev_abc/resolve"), {
      method: "POST",
      headers: authedHeaders("application/json"),
      body: JSON.stringify(body),
    });
  }

  async function callResolve(id: string, body: unknown) {
    const mod = await import("../app/api/v1/decisions/[id]/resolve/route.js");
    return mod.POST(makeReq(body), {
      params: Promise.resolve({ id }),
    });
  }

  it("#1 allow_once -> 200 and DB row updated", async () => {
    mockEvaluationEventFindFirst.mockResolvedValue({
      id: "internal-uuid",
      publicId: "ev_abc",
      decision: "confirm",
      resolution: null,
      resolvedAt: null,
      createdAt: new Date(),
    });
    mockEvaluationEventUpdate.mockResolvedValue({});
    const res = await callResolve("ev_abc", { resolution: "allow_once" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockEvaluationEventUpdate).toHaveBeenCalledWith({
      where: { id: "internal-uuid" },
      data: expect.objectContaining({ resolution: "allow_once" }),
    });
  });

  it("#2 same resolution replay -> 200 idempotent, no DB write", async () => {
    mockEvaluationEventFindFirst.mockResolvedValue({
      id: "internal-uuid",
      publicId: "ev_abc",
      decision: "confirm",
      resolution: "allow_once",
      resolvedAt: new Date(),
      createdAt: new Date(),
    });
    const res = await callResolve("ev_abc", { resolution: "allow_once" });
    expect(res.status).toBe(200);
    expect(mockEvaluationEventUpdate).not.toHaveBeenCalled();
  });

  it("#3 different resolution after resolved -> 409 already_resolved", async () => {
    mockEvaluationEventFindFirst.mockResolvedValue({
      id: "internal-uuid",
      publicId: "ev_abc",
      decision: "confirm",
      resolution: "allow_once",
      resolvedAt: new Date(),
      createdAt: new Date(),
    });
    const res = await callResolve("ev_abc", { resolution: "deny" });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_resolved");
    expect(json.resolution).toBe("allow_once");
  });

  it("#4 unknown id -> 404", async () => {
    mockEvaluationEventFindFirst.mockResolvedValue(null);
    const res = await callResolve("ev_missing", { resolution: "deny" });
    expect(res.status).toBe(404);
  });

  it("#5 cross-account row -> 404 (findFirst scoped by accountId returns null)", async () => {
    mockEvaluationEventFindFirst.mockResolvedValue(null);
    const res = await callResolve("ev_other", { resolution: "deny" });
    expect(res.status).toBe(404);
  });

  it("#6 non-confirm event (decision=block) -> 404", async () => {
    mockEvaluationEventFindFirst.mockResolvedValue({
      id: "internal-uuid",
      publicId: "ev_abc",
      decision: "block",
      resolution: null,
      resolvedAt: null,
      createdAt: new Date(),
    });
    const res = await callResolve("ev_abc", { resolution: "deny" });
    expect(res.status).toBe(404);
  });

  it("#7 older than 24h -> 410 gone", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockEvaluationEventFindFirst.mockResolvedValue({
      id: "internal-uuid",
      publicId: "ev_abc",
      decision: "confirm",
      resolution: null,
      resolvedAt: null,
      createdAt: old,
    });
    const res = await callResolve("ev_abc", { resolution: "deny" });
    expect(res.status).toBe(410);
  });
});
