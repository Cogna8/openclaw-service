import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuthenticatePortalRequest = vi.fn();
vi.mock("../src/middleware/portal-auth.js", () => ({
  authenticatePortalRequest: (...args: any[]) =>
    mockAuthenticatePortalRequest(...args),
}));

const mockListPoliciesForAccount = vi.fn();
const mockEnablePolicyForAccount = vi.fn();
const mockDisablePolicyForAccount = vi.fn();
const mockDeleteTemplateRule = vi.fn();
const mockApplySecureDefaultsForAccount = vi.fn();

vi.mock("../src/services/policy-crud.js", () => ({
  listPoliciesForAccount: (...args: any[]) => mockListPoliciesForAccount(...args),
  enablePolicyForAccount: (...args: any[]) => mockEnablePolicyForAccount(...args),
  disablePolicyForAccount: (...args: any[]) =>
    mockDisablePolicyForAccount(...args),
  deleteTemplateRule: (...args: any[]) => mockDeleteTemplateRule(...args),
  applySecureDefaultsForAccount: (...args: any[]) =>
    mockApplySecureDefaultsForAccount(...args),
}));

describe("portal policy routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CG8_PORTAL_SERVICE_TOKEN = "test-token";

    mockAuthenticatePortalRequest.mockResolvedValue({
      accountId: "11111111-1111-1111-1111-111111111111",
      userId: "user_123",
    });
  });

  it("GET /api/v1/portal/policies returns 200 with policies, including risk_class and category", async () => {
    mockListPoliciesForAccount.mockResolvedValue([
      {
        id: "block_shell_execution",
        name: "Block shell execution",
        description: "desc",
        default_enabled: true,
        risk_class: "critical",
        category: "code_execution",
        enabled: false,
        enabled_at: null,
        variants: ["bash"],
        variants_detailed: [
          { pattern: "bash", description: "Runs Bash commands" },
        ],
        rules: [],
      },
    ]);

    const { GET } = await import("../app/api/v1/portal/policies/route.js");
    const req = new NextRequest("http://localhost:3000/api/v1/portal/policies");

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      policies: [
        {
          id: "block_shell_execution",
          name: "Block shell execution",
          description: "desc",
          default_enabled: true,
          risk_class: "critical",
          category: "code_execution",
          enabled: false,
          enabled_at: null,
          variants: ["bash"],
          variants_detailed: [
            { pattern: "bash", description: "Runs Bash commands" },
          ],
          rules: [],
        },
      ],
    });
  });

  it("GET /api/v1/portal/policies returns 401 when auth fails", async () => {
    const { UnauthorizedError } = await import("../src/lib/errors.js");
    mockAuthenticatePortalRequest.mockRejectedValue(new UnauthorizedError());

    const { GET } = await import("../app/api/v1/portal/policies/route.js");
    const req = new NextRequest("http://localhost:3000/api/v1/portal/policies");

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/portal/policies returns 500 for unexpected error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAuthenticatePortalRequest.mockRejectedValue(new Error("boom"));

    const { GET } = await import("../app/api/v1/portal/policies/route.js");
    const req = new NextRequest("http://localhost:3000/api/v1/portal/policies");

    const res = await GET(req);
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("POST /api/v1/portal/policies/:templateId/enable returns 200", async () => {
    mockEnablePolicyForAccount.mockResolvedValue({
      template_id: "block_shell_execution",
      enabled: true,
      agents_touched: 2,
      rules_created: 2,
    });

    const { POST } = await import(
      "../app/api/v1/portal/policies/[templateId]/enable/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/policies/block_shell_execution/enable",
      { method: "POST" },
    );

    const res = await POST(req, {
      params: Promise.resolve({ templateId: "block_shell_execution" }),
    });

    expect(res.status).toBe(200);
  });

  it("POST /api/v1/portal/policies/:templateId/enable returns 404 from NotFoundError", async () => {
    const { NotFoundError } = await import("../src/lib/errors.js");
    mockEnablePolicyForAccount.mockRejectedValue(
      new NotFoundError("Unknown policy template"),
    );

    const { POST } = await import(
      "../app/api/v1/portal/policies/[templateId]/enable/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/policies/block_shell_execution/enable",
      { method: "POST" },
    );

    const res = await POST(req, {
      params: Promise.resolve({ templateId: "block_shell_execution" }),
    });

    expect(res.status).toBe(404);
  });

  it("POST /api/v1/portal/policies/:templateId/disable returns 200", async () => {
    mockDisablePolicyForAccount.mockResolvedValue({
      template_id: "block_shell_execution",
      enabled: false,
      rules_removed: 2,
    });

    const { POST } = await import(
      "../app/api/v1/portal/policies/[templateId]/disable/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/policies/block_shell_execution/disable",
      { method: "POST" },
    );

    const res = await POST(req, {
      params: Promise.resolve({ templateId: "block_shell_execution" }),
    });

    expect(res.status).toBe(200);
  });

  it("DELETE /api/v1/portal/rules/:rulePublicId returns 200", async () => {
    mockDeleteTemplateRule.mockResolvedValue({
      rule_id: "rl_1",
      removed: true,
    });

    const { DELETE } = await import(
      "../app/api/v1/portal/rules/[rulePublicId]/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/rules/rl_1",
      { method: "DELETE" },
    );

    const res = await DELETE(req, {
      params: Promise.resolve({ rulePublicId: "rl_1" }),
    });

    expect(res.status).toBe(200);
  });

  it("DELETE /api/v1/portal/rules/:rulePublicId returns 400 from ValidationError", async () => {
    const { ValidationError } = await import("../src/lib/errors.js");
    mockDeleteTemplateRule.mockRejectedValue(
      new ValidationError("Only template-provisioned rules can be deleted via this endpoint"),
    );

    const { DELETE } = await import(
      "../app/api/v1/portal/rules/[rulePublicId]/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/rules/rl_1",
      { method: "DELETE" },
    );

    const res = await DELETE(req, {
      params: Promise.resolve({ rulePublicId: "rl_1" }),
    });

    expect(res.status).toBe(400);
  });

  it("POST /api/v1/portal/policies/secure-defaults returns 200 with apply result", async () => {
    mockApplySecureDefaultsForAccount.mockResolvedValue({
      enabled_template_ids: ["block_shell_execution", "block_code_execution"],
      already_enabled_template_ids: ["block_file_deletion"],
      rules_created: 4,
      agents_touched: 2,
    });

    const { POST } = await import(
      "../app/api/v1/portal/policies/secure-defaults/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/policies/secure-defaults",
      { method: "POST" },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled_template_ids: ["block_shell_execution", "block_code_execution"],
      already_enabled_template_ids: ["block_file_deletion"],
      rules_created: 4,
      agents_touched: 2,
    });
    expect(mockApplySecureDefaultsForAccount).toHaveBeenCalledWith({
      accountId: "11111111-1111-1111-1111-111111111111",
      actorUserId: "user_123",
    });
  });

  it("POST /api/v1/portal/policies/secure-defaults returns 401 when auth fails", async () => {
    const { UnauthorizedError } = await import("../src/lib/errors.js");
    mockAuthenticatePortalRequest.mockRejectedValue(new UnauthorizedError());

    const { POST } = await import(
      "../app/api/v1/portal/policies/secure-defaults/route.js"
    );

    const req = new NextRequest(
      "http://localhost:3000/api/v1/portal/policies/secure-defaults",
      { method: "POST" },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
