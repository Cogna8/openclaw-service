import { PrismaClient } from ".prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function createPortalClient(): PrismaClient {
  const url = process.env.CG8_PORTAL_DATABASE_URL;
  if (!url) {
    throw new Error("CG8_PORTAL_DATABASE_URL is required");
  }

  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    try {
      const { ProxyAgent, setGlobalDispatcher } =
        require("undici") as typeof import("undici");
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));
    } catch {
      // undici not available
    }
  }

  const cleanUrl = new URL(url);
  cleanUrl.searchParams.delete("channel_binding");
  const adapter = new PrismaNeon({ connectionString: cleanUrl.toString() });
  return new PrismaClient({ adapter });
}

let instance: PrismaClient | undefined;

export function getPortalDb(): PrismaClient {
  if (!instance) {
    instance = createPortalClient();
  }
  return instance;
}
