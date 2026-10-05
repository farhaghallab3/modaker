/** Prisma-backed WorkflowStore: updates the entity and appends the audit event in ONE transaction. */
import type { PrismaClient } from "@prisma/client";
import type { AuditEvent, EntityState, EntityType, ReviewPatch, WorkflowStore } from "./workflow";

type Row = { reviewState: EntityState["reviewState"]; isDemo?: boolean; authorId?: string | null };

export function createPrismaWorkflowStore(prisma: PrismaClient): WorkflowStore {
  // The delegates share the review columns but have different Prisma types; this table keeps the
  // cast in one place.
  const delegate = (client: Pick<PrismaClient, "story" | "storyChapter" | "video" | "knowledgeChunk" | "knowledgeSource">, type: EntityType) => {
    const map = {
      story: client.story,
      story_chapter: client.storyChapter,
      video: client.video,
      knowledge_chunk: client.knowledgeChunk,
      knowledge_source: client.knowledgeSource,
    } as const;
    return map[type] as unknown as {
      findUnique(args: { where: { id: string } }): Promise<Row | null>;
      update(args: { where: { id: string }; data: ReviewPatch }): Promise<unknown>;
    };
  };

  return {
    async load(type, id) {
      const row = await delegate(prisma, type).findUnique({ where: { id } });
      if (!row) return null;
      return { reviewState: row.reviewState, isDemo: row.isDemo ?? false, authorId: row.authorId ?? null };
    },
    async commit(type, id, patch, event: AuditEvent) {
      await prisma.$transaction(async (tx) => {
        await delegate(tx as unknown as PrismaClient, type).update({ where: { id }, data: patch });
        await tx.contentReviewEvent.create({ data: { ...event } });
      });
    },
  };
}
