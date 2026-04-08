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
  agentPublicId: string,
): Promise<ResolvedAgent> {
  const db = getDb();
  const agent = await db.agent.findFirst({
    where: { publicId: agentPublicId },
    select: { id: true, publicId: true, accountId: true, catalogHash: true, status: true },
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
