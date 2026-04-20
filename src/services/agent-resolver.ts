import { getDb } from "../lib/db.js";
import { NotFoundError } from "../lib/errors.js";

export type ResolvedAgent = {
  id: string;
  publicId: string;
  accountId: string;
  catalogHash: string;
};

export async function resolveAgentForAccount(
  accountId: string,
  agentIdentifier: string,
): Promise<ResolvedAgent> {
  const db = getDb();

  const select = {
    id: true,
    publicId: true,
    accountId: true,
    catalogHash: true,
    status: true,
  } as const;

  const isPublicId = agentIdentifier.startsWith("agt_");

  const agent = isPublicId
    ? await db.agent.findFirst({
        where: { publicId: agentIdentifier },
        select,
      })
    : await db.agent.findFirst({
        where: {
          accountId,
          source: "openclaw",
          externalId: agentIdentifier,
        },
        select,
      });

  if (!agent || agent.accountId !== accountId || agent.status === "archived") {
    throw new NotFoundError("Agent not found");
  }

  // Update lastSeenAt asynchronously — never fail the request path
  db.agent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});

  return {
    id: agent.id,
    publicId: agent.publicId,
    accountId: agent.accountId,
    catalogHash: agent.catalogHash,
  };
}
