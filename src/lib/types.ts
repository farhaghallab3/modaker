/**
 * Shared domain types. These mirror the Prisma models (prisma/schema.prisma)
 * but are framework-free so the same contracts can be consumed by the web
 * app, API route handlers and — later — the mobile client.
 */

// ── Quran ────────────────────────────────────────────────────────────────
export type Revelation = "meccan" | "medinan";

export interface SurahMeta {
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  revelation: Revelation;
}

/** A verse as delivered by a verified Quran source. Never LLM-generated. */
export interface Ayah {
  surah: number;
  ayah: number;
  /** "19:32" */
  key: string;
  /** Uthmani script exactly as published by the source. */
  textUthmani: string;
  /** Optional simple-script text from the same source (used for matching). */
  textSimple?: string;
  page?: number;
  juz?: number;
  audioUrl?: string;
}

export interface SourceRef {
  /** Stable id of the approved source, e.g. "quran-com:uthmani", "tafsir:muyassar". */
  id: string;
  title: string;
  publisher?: string;
  url?: string;
}

export interface SurahText {
  meta: SurahMeta;
  ayahs: Ayah[];
  source: SourceRef;
}

export interface TafsirEntry {
  key: string; // "19:32"
  text: string;
  source: SourceRef;
}

export interface AyahRange {
  surah: number;
  from: number;
  to: number;
}

// ── User / onboarding ────────────────────────────────────────────────────
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type MemorizedAmount = "none" | "juz-amma" | "few-juz" | "half" | "most" | "all";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  level: ExperienceLevel;
  memorizedAmount: MemorizedAmount;
  dailyTargetAyahs: number;
  reviewSessionsPerDay: number;
  reminderTime: string; // "HH:mm" local
  locale: "ar" | "en";
  createdAt: string;
  onboarded: boolean;
}

// ── Progress / memorization ──────────────────────────────────────────────
export type AyahStatus = "new" | "learning" | "memorized" | "weak" | "mastered";

/** Per-ayah memory state — the unit the review scheduler works on. */
export interface AyahProgress {
  key: string; // "19:32"
  surah: number;
  ayah: number;
  status: AyahStatus;
  memorizedAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  /** SM-2 style ease factor (1.3 – 2.8). */
  ease: number;
  /** Current interval in days. */
  intervalDays: number;
  /** Consecutive successful reviews. */
  streak: number;
  successCount: number;
  mistakeCount: number;
  /** Rolling recitation accuracy 0..1. */
  accuracy?: number;
}

/** Exactly where the user stopped — powers "continue from the exact ayah". */
export interface ResumePoint {
  surah: number;
  ayah: number;
  mode: "memorize" | "recite" | "read";
  updatedAt: string;
}

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  memorized: number;
  reviewed: number;
  recitations: number;
}

export interface Bookmark {
  key: string;
  createdAt: string;
  note?: string;
}

// ── Recitation ───────────────────────────────────────────────────────────
export type MistakeType = "omitted" | "added" | "incorrect" | "order" | "hesitation";

export interface RecognizedWord {
  text: string;
  /** seconds from recording start, when the STT provider supplies timings */
  start?: number;
  end?: number;
}

export interface Transcript {
  text: string;
  words?: RecognizedWord[];
  provider: string;
  language: string;
  durationSec?: number;
}

export interface RecitationMistake {
  type: MistakeType;
  ayahKey: string;
  /** index of the word inside the expected ayah, when applicable */
  wordIndex?: number;
  expected?: string;
  heard?: string;
  /** seconds of silence for hesitation */
  pauseSec?: number;
}

export interface AyahRecitationResult {
  key: string;
  ayah: number;
  accuracy: number; // 0..1
  status: "mastered" | "needs-review" | "missed";
  /** per expected word: matched / mismatched / omitted */
  words: { text: string; state: "ok" | "incorrect" | "omitted"; heard?: string }[];
  mistakes: RecitationMistake[];
}

export interface RecitationAnalysis {
  range: AyahRange;
  accuracy: number; // 0..1 over all expected words
  ayahs: AyahRecitationResult[];
  mistakes: RecitationMistake[];
  extraWords: string[];
  transcript: Transcript;
  /** Always true: text matching only, never acoustic tajweed assessment. */
  textOnly: true;
}

// ── Review ───────────────────────────────────────────────────────────────
export type ReviewBucket = "today" | "weak" | "mastered" | "upcoming";

export interface ReviewItem {
  surah: number;
  from: number;
  to: number;
  dueAt: string;
  priority: number; // higher = sooner
  bucket: ReviewBucket;
  avgAccuracy?: number;
  mistakes: number;
}

// ── Content ──────────────────────────────────────────────────────────────
export interface StoryChapter {
  id: string;
  order: number;
  title: string;
  /** Editorial framing (human-written, reviewed). Short. */
  summary: string;
  ranges: AyahRange[];
}

export interface Story {
  slug: string;
  title: string;
  subtitle: string;
  intro: string;
  surahs: number[];
  chapters: StoryChapter[];
  references: SourceRef[];
  videoIds: string[];
  /** "verified" = reviewed by a qualified editor; "demo" = placeholder copy */
  contentStatus: "verified" | "demo";
  accent: "olive" | "sand" | "terracotta" | "forest";
}

export interface Video {
  id: string;
  youtubeId: string | null;
  title: string;
  channel: string;
  description: string;
  surah?: number;
  storySlug?: string;
  range?: AyahRange;
  durationLabel?: string;
  contentStatus: "verified" | "demo";
}

// ── Assistant ────────────────────────────────────────────────────────────
export type AnswerKind = "grounded" | "insufficient" | "needs-scholar" | "quran-text" | "unavailable";

export interface Citation {
  sourceId: string;
  title: string;
  ref: string; // "مريم: 32" or "التفسير الميسر — مريم 32"
  excerpt: string;
  url?: string;
}

export interface AssistantAnswer {
  kind: AnswerKind;
  text: string;
  /** Verbatim verses pulled from the Quran provider (never from the LLM). */
  verses?: Ayah[];
  citations: Citation[];
  provider: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: AssistantAnswer;
  createdAt: string;
}

// ── Notifications ────────────────────────────────────────────────────────
export type NotificationKind = "daily-wird" | "review-due" | "welcome-back" | "goal-complete" | "streak";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationPreferences {
  dailyReminder: boolean;
  reviewReminder: boolean;
  preferredTime: string; // "HH:mm"
  frequency: "daily" | "weekdays" | "custom";
  customDays: number[]; // 0=Sun
  pushEnabled: boolean;
  quietHours?: { from: string; to: string };
}
