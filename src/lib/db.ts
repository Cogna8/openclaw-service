import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma.js";

let instance: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (!instance) {
    instance = createPrismaClient();
  }
  return instance;
}
