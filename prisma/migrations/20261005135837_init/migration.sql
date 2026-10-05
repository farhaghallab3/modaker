-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "MemorizedAmount" AS ENUM ('none', 'juz_amma', 'few_juz', 'half', 'most', 'all');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "Revelation" AS ENUM ('meccan', 'medinan');

-- CreateEnum
CREATE TYPE "AyahStatus" AS ENUM ('new', 'learning', 'memorized', 'weak', 'mastered');

-- CreateEnum
CREATE TYPE "ResumeMode" AS ENUM ('memorize', 'recite', 'read');

-- CreateEnum
CREATE TYPE "MistakeType" AS ENUM ('omitted', 'added', 'incorrect', 'order', 'hesitation');

-- CreateEnum
CREATE TYPE "RecitationAyahStatus" AS ENUM ('mastered', 'needs_review', 'missed');

-- CreateEnum
CREATE TYPE "ReviewBucket" AS ENUM ('today', 'weak', 'mastered', 'upcoming');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('verified', 'demo');

-- CreateEnum
CREATE TYPE "KnowledgeKind" AS ENUM ('quran', 'tafsir', 'asbab', 'translation', 'curated');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "AnswerKind" AS ENUM ('grounded', 'insufficient', 'needs_scholar', 'quran_text', 'unavailable');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('daily_wird', 'review_due', 'welcome_back', 'goal_complete', 'streak');

-- CreateEnum
CREATE TYPE "ReminderFrequency" AS ENUM ('daily', 'weekdays', 'custom');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('web', 'fcm', 'apns');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ExperienceLevel" NOT NULL DEFAULT 'beginner',
    "memorizedAmount" "MemorizedAmount" NOT NULL DEFAULT 'none',
    "dailyTargetAyahs" INTEGER NOT NULL DEFAULT 5,
    "reviewSessionsPerDay" INTEGER NOT NULL DEFAULT 1,
    "reminderTime" TEXT NOT NULL DEFAULT '05:30',
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "keepRecordings" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStateSnapshot" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStateSnapshot_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Surah" (
    "number" INTEGER NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "ayahCount" INTEGER NOT NULL,
    "revelation" "Revelation" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Surah_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Ayah" (
    "id" SERIAL NOT NULL,
    "surahNumber" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "globalIndex" INTEGER NOT NULL,
    "textUthmani" TEXT NOT NULL,
    "textSimple" TEXT,
    "page" INTEGER,
    "juz" INTEGER,
    "sourceId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "Ayah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorizationGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyAyahs" INTEGER NOT NULL,
    "weeklyDays" INTEGER NOT NULL,
    "targetSurah" INTEGER,
    "targetDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemorizationGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorizationProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "ayah" INTEGER NOT NULL,
    "status" "AyahStatus" NOT NULL DEFAULT 'new',
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.3,
    "intervalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "mistakeCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION,
    "memorizedAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemorizationProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumePoint" (
    "userId" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "ayah" INTEGER NOT NULL,
    "mode" "ResumeMode" NOT NULL DEFAULT 'memorize',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumePoint_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MemorizationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "ayahsMemorized" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "MemorizationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecitationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "audioStorageKey" TEXT,
    "audioMimeType" TEXT,
    "audioExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecitationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecitationResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ayahKey" TEXT NOT NULL,
    "ayah" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "status" "RecitationAyahStatus" NOT NULL,

    CONSTRAINT "RecitationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecitationMistake" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "MistakeType" NOT NULL,
    "ayahKey" TEXT NOT NULL,
    "wordIndex" INTEGER,
    "expected" TEXT,
    "heard" TEXT,
    "pauseSec" DOUBLE PRECISION,

    CONSTRAINT "RecitationMistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bucket" "ReviewBucket" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "surah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "mistakes" INTEGER NOT NULL,
    "grade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "surahs" INTEGER[],
    "accent" TEXT NOT NULL,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'demo',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "references" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryChapter" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "StoryChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryAyahReference" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "chapterId" TEXT,
    "surah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,

    CONSTRAINT "StoryAyahReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "youtubeId" TEXT,
    "title" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "surah" INTEGER,
    "fromAyah" INTEGER,
    "toAyah" INTEGER,
    "durationLabel" TEXT,
    "storyId" TEXT,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'demo',

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TafsirSource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "url" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "quranComId" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TafsirSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TafsirEntry" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "ayah" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "TafsirEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "url" TEXT,
    "kind" "KnowledgeKind" NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "editorial" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "ayahKey" TEXT,
    "surah" INTEGER,
    "ayahFrom" INTEGER,
    "ayahTo" INTEGER,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "answerKind" "AnswerKind",
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "url" TEXT,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "dailyReminder" BOOLEAN NOT NULL DEFAULT true,
    "reviewReminder" BOOLEAN NOT NULL DEFAULT true,
    "preferredTime" TEXT NOT NULL DEFAULT '05:30',
    "frequency" "ReminderFrequency" NOT NULL DEFAULT 'daily',
    "customDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietFrom" TEXT,
    "quietTo" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "deliveredVia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL DEFAULT 'web',
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "surah" INTEGER NOT NULL,
    "ayah" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "memorized" INTEGER NOT NULL DEFAULT 0,
    "reviewed" INTEGER NOT NULL DEFAULT 0,
    "recitations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ayah_key_key" ON "Ayah"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Ayah_globalIndex_key" ON "Ayah"("globalIndex");

-- CreateIndex
CREATE INDEX "Ayah_page_idx" ON "Ayah"("page");

-- CreateIndex
CREATE INDEX "Ayah_juz_idx" ON "Ayah"("juz");

-- CreateIndex
CREATE UNIQUE INDEX "Ayah_surahNumber_number_key" ON "Ayah"("surahNumber", "number");

-- CreateIndex
CREATE INDEX "MemorizationGoal_userId_active_idx" ON "MemorizationGoal"("userId", "active");

-- CreateIndex
CREATE INDEX "MemorizationProgress_userId_nextReviewAt_idx" ON "MemorizationProgress"("userId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "MemorizationProgress_userId_status_idx" ON "MemorizationProgress"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MemorizationProgress_userId_surah_ayah_key" ON "MemorizationProgress"("userId", "surah", "ayah");

-- CreateIndex
CREATE INDEX "MemorizationSession_userId_startedAt_idx" ON "MemorizationSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "RecitationSession_userId_createdAt_idx" ON "RecitationSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecitationSession_audioExpiresAt_idx" ON "RecitationSession"("audioExpiresAt");

-- CreateIndex
CREATE INDEX "RecitationResult_sessionId_idx" ON "RecitationResult"("sessionId");

-- CreateIndex
CREATE INDEX "RecitationMistake_sessionId_idx" ON "RecitationMistake"("sessionId");

-- CreateIndex
CREATE INDEX "ReviewSchedule_userId_dueAt_idx" ON "ReviewSchedule"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "ReviewAttempt_userId_createdAt_idx" ON "ReviewAttempt"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoryChapter_storyId_order_key" ON "StoryChapter"("storyId", "order");

-- CreateIndex
CREATE INDEX "StoryAyahReference_surah_fromAyah_idx" ON "StoryAyahReference"("surah", "fromAyah");

-- CreateIndex
CREATE INDEX "StoryAyahReference_storyId_idx" ON "StoryAyahReference"("storyId");

-- CreateIndex
CREATE INDEX "Video_surah_idx" ON "Video"("surah");

-- CreateIndex
CREATE UNIQUE INDEX "TafsirSource_slug_key" ON "TafsirSource"("slug");

-- CreateIndex
CREATE INDEX "TafsirEntry_surah_idx" ON "TafsirEntry"("surah");

-- CreateIndex
CREATE UNIQUE INDEX "TafsirEntry_sourceId_surah_ayah_key" ON "TafsirEntry"("sourceId", "surah", "ayah");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceId_idx" ON "KnowledgeChunk"("sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_surah_idx" ON "KnowledgeChunk"("surah");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_sourceId_contentHash_key" ON "KnowledgeChunk"("sourceId", "contentHash");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_updatedAt_idx" ON "ChatConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_key_key" ON "Bookmark"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivity_userId_date_key" ON "DailyActivity"("userId", "date");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStateSnapshot" ADD CONSTRAINT "UserStateSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ayah" ADD CONSTRAINT "Ayah_surahNumber_fkey" FOREIGN KEY ("surahNumber") REFERENCES "Surah"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorizationGoal" ADD CONSTRAINT "MemorizationGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorizationProgress" ADD CONSTRAINT "MemorizationProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumePoint" ADD CONSTRAINT "ResumePoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorizationSession" ADD CONSTRAINT "MemorizationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecitationSession" ADD CONSTRAINT "RecitationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecitationResult" ADD CONSTRAINT "RecitationResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecitationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecitationMistake" ADD CONSTRAINT "RecitationMistake_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecitationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttempt" ADD CONSTRAINT "ReviewAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttempt" ADD CONSTRAINT "ReviewAttempt_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReviewSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryChapter" ADD CONSTRAINT "StoryChapter_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryAyahReference" ADD CONSTRAINT "StoryAyahReference_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryAyahReference" ADD CONSTRAINT "StoryAyahReference_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "StoryChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TafsirEntry" ADD CONSTRAINT "TafsirEntry_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TafsirSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
