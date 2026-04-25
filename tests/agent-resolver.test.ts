import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAgentFindFirst = vi.fn();
const mockAgentUpdate = vi.fn().mockResolvedValue({});

vi.mock("../src/lib/db.js", () => ({
  getDb: () => ({
    agent: {
      findFirst: mockAgentFindFirst,
      update: mockAgentUpdate,
    },
  }),
}));

import { resolveAgentForAccount } from "../src/services/agent-resolver.js";

const ACCOUNT_ID = "acct-uuid";
const AGENT_ROW = {
  id: "agent-uuid",
  publicId: "agt_VA8FoJ9o",
  accountId: ACCOUNT_ID,
  catalogHash: "abc123",
  status: "active",
};

describe("resolveAgentForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves openclaw agents by external_id", async () => {
    mockAgentFindFirst.mockResolvedValue(AGENT_ROW);

    const resolved = await resolveAgentForAccount(ACCOUNT_ID, "default");

    expect(mockAgentFindFirst).toHaveBeenCalledWith({
      where: {
        accountId: ACCOUNT_ID,
        source: "openclaw",
        externalId: "default",
      },
      select: {
        id: true,
        publicId: true,
        accountId: true,
        catalogHash: true,
        status: true,
        pluginVersion: true,
      },
    });
    expect(resolved).toEqual({
      id: AGENT_ROW.id,
      publicId: AGENT_ROW.publicId,
      accountId: AGENT_ROW.accountId,
      catalogHash: AGENT_ROW.catalogHash,
      pluginVersion: null,
    });
  });

  it("resolves agents by agt_* publicId (regression)", async () => {
    mockAgentFindFirst.mockResolvedValue(AGENT_ROW);

    const resolved = await resolveAgentForAccount(ACCOUNT_ID, "agt_VA8FoJ9o");

    expect(mockAgentFindFirst).toHaveBeenCalledWith({
      where: { publicId: "agt_VA8FoJ9o" },
      select: {
        id: true,
        publicId: true,
        accountId: true,
        catalogHash: true,
        status: true,
        pluginVersion: true,
      },
    });
    expect(resolved.publicId).toBe("agt_VA8FoJ9o");
  });

  it("throws NotFoundError when external_id is unknown", async () => {
    mockAgentFindFirst.mockResolvedValue(null);

    await expect(
      resolveAgentForAccount(ACCOUNT_ID, "missing-external-id"),
    ).rejects.toThrow("Agent not found");
  });

  it("throws NotFoundError when an external_id agent belongs to another account", async () => {
    // Defense-in-depth: even if findFirst somehow returned a row with a
    // different accountId, the resolver must reject it.
    mockAgentFindFirst.mockResolvedValue({
      ...AGENT_ROW,
      accountId: "other-acct-uuid",
    });

    await expect(
      resolveAgentForAccount(ACCOUNT_ID, "default"),
    ).rejects.toThrow("Agent not found");
  });

  it("throws NotFoundError when agent is archived", async () => {
    mockAgentFindFirst.mockResolvedValue({ ...AGENT_ROW, status: "archived" });

    await expect(
      resolveAgentForAccount(ACCOUNT_ID, "default"),
    ).rejects.toThrow("Agent not found");
  });
});
