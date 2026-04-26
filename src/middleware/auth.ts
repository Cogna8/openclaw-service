import { NextRequest } from "next/server";
import { getDb } from "../lib/db.js";
import { hashApiKey } from "../lib/api-key-utils.js";
import { UnauthorizedError } from "../lib/errors.js";

export type AccountCapabilityFlags = Record<string, unknown>;

export type AuthContext = {
  accountId: string;
  apiKeyId: string;
  publicKeyId: string;
  account: {
    capabilityFlags: AccountCapabilityFlags;
  };
};

function coerceCapabilityFlags(value: unknown): AccountCapabilityFlags {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AccountCapabilityFlags;
  }
  return {};
}

export async function authenticateRequest(req: NextRequest): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new UnauthorizedError();
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    throw new UnauthorizedError();
  }

  const rawToken = parts[1];
  const { lookupHash } = hashApiKey(rawToken);

  const db = getDb();
  const apiKey = await db.apiKey.findFirst({
    where: { lookupHash, status: "active" },
    select: {
      id: true,
      publicId: true,
      accountId: true,
      account: { select: { capabilityFlags: true } },
    },
  });

  if (!apiKey) {
    throw new UnauthorizedError();
  }

  // Update lastUsedAt asynchronously — never fail the request path
  db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    accountId: apiKey.accountId,
    apiKeyId: apiKey.id,
    publicKeyId: apiKey.publicId,
    account: {
      capabilityFlags: coerceCapabilityFlags(apiKey.account?.capabilityFlags),
    },
  };
}
