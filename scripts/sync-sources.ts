/**
 * Sync the source registry (src/server/rag/sources.ts) into PostgreSQL.
 *
 *   npx tsx scripts/sync-sources.ts
 *
 * Creates missing sources (planned ones as disabled + draft) and refreshes descriptive metadata.
 * Never changes `enabled` / `reviewState` of an existing source.
 */
import { getPrisma } from "@/server/db";
import { syncSourceRegistry } from "@/server/rag/registry-sync";
import { log } from "./_util";

async function main() {
  const prisma = await getPrisma();
  const r = await syncSourceRegistry(prisma);
  log(`created ${r.created.length}: ${r.created.join(", ") || "—"}`);
  log(`refreshed metadata for ${r.updated.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
