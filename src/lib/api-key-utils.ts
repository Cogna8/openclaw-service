import { createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "cg8_sk_";

export function generateRawApiKey(): string {
  const secret = randomBytes(32).toString("base64url");
  return `${SECRET_PREFIX}${secret}`;
}

export function hashApiKey(rawKey: string): {
  lookupHash: string;
  secretHash: string;
  lastFour: string;
  secretPrefix: string;
} {
  const hash = createHash("sha256").update(rawKey).digest("hex");
  return {
    lookupHash: hash,
    secretHash: hash,
    lastFour: rawKey.slice(-4),
    secretPrefix: SECRET_PREFIX,
  };
}
