import { createPrismaClient } from "./prisma.js";

type DbClient = ReturnType<typeof createPrismaClient>;

/**
 * Returns a fresh PrismaClient on each call.
 *
 * Per Neon's serverless driver docs, Pool/Client connections cannot outlive
 * a single request on Vercel serverless. A module-level singleton works for
 * one-shot queries but breaks interactive transactions with
 * "Transaction not found" errors when Lambda freezes and thaws.
 *
 * We intentionally do NOT cache the client at module scope. Callers within
 * a single request should hold onto the returned client for the duration of
 * their work; they should not call getDb() repeatedly and expect the same
 * instance back.
 *
 * https://github.com/neondatabase/serverless
 */
export function getDb(): DbClient {
  return createPrismaClient();
}
