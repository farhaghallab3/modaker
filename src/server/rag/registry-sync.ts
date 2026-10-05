/**
 * Sync the code-side source registry (sources.ts) into the `KnowledgeSource` table.
 *
 * - Missing rows are created with the registry's initial state (planned sources: disabled + draft).
 * - Existing rows only get their descriptive METADATA refreshed. `enabled`, `reviewState`,
 *   `licenseVerified` and review fields are never touched here: those are decisions owned by the
 *   review workflow / admin, and a deploy must not silently undo them.
 */
import type { PrismaClient } from "@prisma/client";
import { KNOWLEDGE_SOURCES } from "./sources";

export interface SyncResult {
  created: string[];
  updated: string[];
}

export async function syncSourceRegistry(prisma: PrismaClient): Promise<SyncResult> {
  const created: string[] = [];
  const updated: string[] = [];
  for (const s of Object.values(KNOWLEDGE_SOURCES)) {
    const metadata = {
      title: s.title,
      publisher: s.publisher ?? null,
      url: s.url ?? null,
      kind: s.kind,
      editorial: Boolean(s.editorial),
      tier: s.tier,
      authorityType: s.authorityType,
      languages: s.languages,
      apiAvailable: s.apiAvailable,
      apiDocsUrl: s.apiDocsUrl ?? null,
      mcpAvailable: s.mcpAvailable,
      autoRetrievalSuitable: s.autoRetrievalSuitable,
      requiresHumanReview: s.requiresHumanReview,
      licenseNote: s.licenseNote ?? null,
    };
    const existing = await prisma.knowledgeSource.findUnique({ where: { id: s.id }, select: { id: true } });
    if (existing) {
      await prisma.knowledgeSource.update({ where: { id: s.id }, data: metadata });
      updated.push(s.id);
    } else {
      await prisma.knowledgeSource.create({
        data: {
          id: s.id,
          ...metadata,
          enabled: s.enabled,
          reviewState: s.reviewState,
          licenseVerified: s.licenseVerified,
          reviewNote: s.reviewNote ?? null,
        },
      });
      created.push(s.id);
    }
  }
  return { created, updated };
}
