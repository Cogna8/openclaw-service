import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock getDb for auth
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    apiKey: {
      findFirst: mockFindFirst,
      update: mockUpdate,
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
      const req = new NextRequest(makeUrl("/"));
      const res = await GET(req);
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
    it("POST /v1/evaluate -> 501", async () => {
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
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.error).toBe("not_implemented");
      expect(body.message).toContain("Pack 3");
    });

    it("POST /v1/rules -> 501", async () => {
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
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.message).toContain("Pack 4");
    });

    it("GET /v1/rules -> 501", async () => {
      const { GET } = await import("../app/api/v1/rules/route.js");
      const req = new NextRequest(
        makeUrl("/api/v1/rules?agent_id=agt_test"),
      );
      // Need to add auth header
      const req2 = new NextRequest(
        makeUrl("/api/v1/rules?agent_id=agt_test"),
        { headers: authedHeaders() },
      );
      const res = await GET(req2);
      expect(res.status).toBe(501);
    });

    it("DELETE /v1/rules/:ruleId -> 501", async () => {
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
      expect(res.status).toBe(501);
    });

    it("POST /v1/rules/:ruleId/enable -> 501", async () => {
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
      expect(res.status).toBe(501);
    });

    it("POST /v1/rules/:ruleId/disable -> 501", async () => {
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
      expect(res.status).toBe(501);
    });

    it("POST /v1/agents/register -> 501", async () => {
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
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.message).toContain("Pack 5");
    });

    it("GET /v1/status -> 501", async () => {
      const { GET } = await import("../app/api/v1/status/route.js");
      const req = new NextRequest(makeUrl("/api/v1/status"), {
        headers: authedHeaders(),
      });
      const res = await GET(req);
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.message).toContain("Pack 5");
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
        expect(res.status).toBe(501); // passes middleware, gets 501
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
