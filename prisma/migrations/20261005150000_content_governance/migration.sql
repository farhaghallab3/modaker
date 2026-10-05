-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('imported', 'editorial');

-- CreateEnum
CREATE TYPE "AuthorityType" AS ENUM ('official_institution', 'scholarly_foundation', 'community_platform', 'aggregator', 'editorial_team');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('submit', 'approve', 'reject', 'publish', 'archive', 'reopen');

-- CreateEnum
CREATE TYPE "SafetyLevel" AS ENUM ('A', 'B', 'C', 'D');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "KnowledgeKind" ADD VALUE 'hadith';
ALTER TYPE "KnowledgeKind" ADD VALUE 'seerah';
ALTER TYPE "KnowledgeKind" ADD VALUE 'glossary';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "abstainReason" TEXT,
ADD COLUMN     "answerType" TEXT,
ADD COLUMN     "blocks" JSONB,
ADD COLUMN     "generationUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "safetyLevel" "SafetyLevel";

-- AlterTable
ALTER TABLE "KnowledgeChunk" ADD COLUMN     "author" TEXT,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "gradedBy" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "KnowledgeKind",
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'ar',
ADD COLUMN     "locator" TEXT,
ADD COLUMN     "origin" "ContentOrigin" NOT NULL DEFAULT 'imported',
ADD COLUMN     "reviewState" "ReviewState" NOT NULL DEFAULT 'draft',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN     "apiAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "apiDocsUrl" TEXT,
ADD COLUMN     "authorityType" "AuthorityType",
ADD COLUMN     "autoRetrievalSuitable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "licenseNote" TEXT,
ADD COLUMN     "licenseVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mcpAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresHumanReview" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewState" "ReviewState" NOT NULL DEFAULT 'draft',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "ContentOrigin" NOT NULL DEFAULT 'editorial',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewState" "ReviewState" NOT NULL DEFAULT 'draft',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT;

-- AlterTable
ALTER TABLE "StoryChapter" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "ContentOrigin" NOT NULL DEFAULT 'editorial',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewState" "ReviewState" NOT NULL DEFAULT 'draft',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "ContentOrigin" NOT NULL DEFAULT 'editorial',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewState" "ReviewState" NOT NULL DEFAULT 'draft',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT;



-- ═══════════════════════════════════════════════════════════════════════
-- DATA MAPPING (hand-written; preserves existing content without publishing any of it)
--   contentStatus 'demo'     -> isDemo = true,  reviewState = 'draft'
--   contentStatus 'verified' -> isDemo = false, reviewState = 'approved'   (NEVER 'published')
-- Demo content stays visible in development only because it is flagged isDemo; it can never be
-- retrieved by the assistant (retrieval requires reviewState = 'published' AND isDemo = false).
-- ═══════════════════════════════════════════════════════════════════════
UPDATE "Story"
   SET "isDemo" = ("contentStatus" = 'demo'),
       "reviewState" = CASE WHEN "contentStatus" = 'verified' THEN 'approved'::"ReviewState" ELSE 'draft'::"ReviewState" END;

UPDATE "Video"
   SET "isDemo" = ("contentStatus" = 'demo'),
       "reviewState" = CASE WHEN "contentStatus" = 'verified' THEN 'approved'::"ReviewState" ELSE 'draft'::"ReviewState" END;

UPDATE "StoryChapter" c
   SET "isDemo" = s."isDemo", "reviewState" = s."reviewState"
  FROM "Story" s
 WHERE s."id" = c."storyId";

-- Legacy `approved` flag -> registry state. Editorial sources are never usable by the assistant.
UPDATE "KnowledgeSource"
   SET "enabled" = ("approved" AND NOT "editorial"),
       "reviewState" = CASE WHEN "approved" AND NOT "editorial" THEN 'published'::"ReviewState" ELSE 'draft'::"ReviewState" END,
       "reviewNote" = CASE WHEN "approved" AND NOT "editorial"
                           THEN 'Approved by project configuration before the review workflow existed; re-confirm when a reviewer is assigned.'
                           ELSE NULL END;

-- Editorial (story-derived) chunks must not exist in the knowledge base: remove any previously indexed.
DELETE FROM "KnowledgeChunk"
 WHERE "sourceId" IN (SELECT "id" FROM "KnowledgeSource" WHERE "editorial" = true);

-- Verbatim chunks from enabled, approved sources stay retrievable.
UPDATE "KnowledgeChunk" c
   SET "reviewState" = 'published'::"ReviewState", "kind" = s."kind", "origin" = 'imported'::"ContentOrigin"
  FROM "KnowledgeSource" s
 WHERE s."id" = c."sourceId" AND s."enabled" = true;

-- Now the legacy columns can go.
ALTER TABLE "Story" DROP COLUMN "contentStatus", DROP COLUMN "published";
ALTER TABLE "Video" DROP COLUMN "contentStatus";
ALTER TABLE "KnowledgeSource" DROP COLUMN "approved";
DROP TYPE "ContentStatus";

-- CreateTable
CREATE TABLE "ContentReviewEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "fromState" "ReviewState" NOT NULL,
    "toState" "ReviewState" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentReviewEvent_entityType_entityId_createdAt_idx" ON "ContentReviewEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReviewEvent_actorId_idx" ON "ContentReviewEvent"("actorId");

-- AddForeignKey
ALTER TABLE "ContentReviewEvent" ADD CONSTRAINT "ContentReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

