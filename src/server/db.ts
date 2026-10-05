/**
 * Shared Prisma client, created lazily so that modules which *may* use the
 * database (e.g. the Quran provider factory) can be imported without
 * @prisma/client being generated or DATABASE_URL being set.
 */
import type { PrismaClient } from "@prisma/client";
import { DatabaseNotConfiguredError } from "./errors";

const globalForPrisma = globalThis as unknown as { __muzakkirPrisma?: PrismaClient };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getPrisma(): Promise<PrismaClient> {
  if (!hasDatabase()) throw new DatabaseNotConfiguredError();
  if (globalForPrisma.__muzakkirPrisma) return globalForPrisma.__muzakkirPrisma;
  const { PrismaClient: Client } = await import("@prisma/client");
  const client = new Client({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Reuse across hot reloads in dev and across route modules in prod.
  globalForPrisma.__muzakkirPrisma = client;
  return client;
}
