import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  // Use undici proxy agent when HTTPS_PROXY is set (e.g., in sandboxed environments)
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    try {
      const { ProxyAgent, setGlobalDispatcher } = require("undici") as typeof import("undici");
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));
    } catch {
      // undici not available, proceed without proxy
    }
  }

  // Strip channel_binding param - incompatible with Neon adapter (TCP-only feature)
  const cleanUrl = new URL(url);
  cleanUrl.searchParams.delete("channel_binding");
  const adapter = new PrismaNeon({ connectionString: cleanUrl.toString() });
  return new PrismaClient({ adapter });
}
