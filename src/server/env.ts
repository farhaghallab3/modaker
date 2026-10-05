/**
 * Server-only environment access. Nothing here may be prefixed NEXT_PUBLIC_
 * except values that are intentionally public (audio CDN, VAPID public key).
 * Read lazily (functions, not constants) so tests and scripts can set
 * process.env before first use.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(str(name), 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  isProd: () => process.env.NODE_ENV === "production",
  databaseUrl: () => str("DATABASE_URL"),
  sessionSecret: () => str("SESSION_SECRET"),

  quranProvider: () => str("QURAN_PROVIDER", "quran-com") as "quran-com" | "database" | "json",
  quranComApi: () => str("QURAN_COM_API", "https://api.quran.com/api/v4").replace(/\/+$/, ""),
  quranJsonDir: () => str("QURAN_JSON_DIR", "data/quran"),
  tafsirJsonDir: () => str("TAFSIR_JSON_DIR", "data/tafsir"),
  ayahAudioBase: () => str("NEXT_PUBLIC_AYAH_AUDIO_BASE", "https://everyayah.com/data/Alafasy_128kbps").replace(/\/+$/, ""),

  sttProvider: () => str("STT_PROVIDER", "openai") as "openai" | "mock",
  openaiApiKey: () => str("OPENAI_API_KEY"),
  openaiBaseUrl: () => str("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/+$/, ""),
  openaiSttModel: () => str("OPENAI_STT_MODEL", "whisper-1"),
  openaiChatModel: () => str("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
  openaiEmbeddingModel: () => str("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),

  llmProvider: () => str("LLM_PROVIDER", "extractive") as "anthropic" | "openai" | "extractive",
  anthropicApiKey: () => str("ANTHROPIC_API_KEY"),
  anthropicModel: () => str("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
  /**
   * Generative religious answers are OFF unless explicitly enabled — having an API key is not
   * enough. Even when on, generation is limited to Level B questions and every answer passes the
   * verifier (src/server/safety/answer-verifier.ts).
   */
  assistantGeneration: () => str("ASSISTANT_GENERATION", "off").toLowerCase() === "on",
  embeddingProvider: () => str("EMBEDDING_PROVIDER", "openai") as "openai" | "none",

  /** 0 = never persist audio (default). */
  recordingRetentionDays: () => Math.max(0, int("RECORDING_RETENTION_DAYS", 0)),
  recordingsDir: () => str("RECORDINGS_DIR", "data/recordings"),
  maxUploadBytes: () => int("MAX_AUDIO_UPLOAD_BYTES", 15 * 1024 * 1024),

  vapidPublicKey: () => str("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: () => str("VAPID_PRIVATE_KEY"),
  vapidSubject: () => str("VAPID_SUBJECT", "mailto:hello@example.com"),

  cronSecret: () => str("CRON_SECRET"),
  /** Fallback IANA zone for users who never sent one. */
  defaultTimeZone: () => str("DEFAULT_TIME_ZONE", "Asia/Riyadh"),
};
