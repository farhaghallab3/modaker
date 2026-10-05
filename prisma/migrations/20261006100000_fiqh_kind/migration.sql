-- Taxonomy: general fiqh is a first-class source kind (knowledge gap recorded in docs/BACKLOG.md).
-- AlterEnum
ALTER TYPE "KnowledgeKind" ADD VALUE 'fiqh';

-- AlterTable: a fiqh chunk states one madhhab's position (null for non-fiqh content).
ALTER TABLE "KnowledgeChunk" ADD COLUMN     "madhhab" TEXT;
