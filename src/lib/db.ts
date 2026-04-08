import { createPrismaClient } from "./prisma.js";

type DbClient = ReturnType<typeof createPrismaClient>;

let instance: DbClient | undefined;

export function getDb(): DbClient {
  if (!instance) {
    instance = createPrismaClient();
  }
  return instance;
}
