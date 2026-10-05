/**
 * POST /api/v1/recitation/transcribe  (multipart/form-data)
 *   audio: Blob (≤ 15 MB, audio/* allowlist)   range: JSON AyahRange
 *   → Transcript
 *
 * Privacy: audio is held in memory, sent to the STT provider and discarded.
 * It is persisted only if RECORDING_RETENTION_DAYS > 0 AND the signed-in user
 * opted in (UserProfile.keepRecordings); then it expires automatically.
 */
import { optionalSession } from "@/server/auth";
import { env } from "@/server/env";
import { ApiError, ProviderError, apiError } from "@/server/errors";
import { enforceRateLimit, json, route } from "@/server/http";
import { getRecordingStore, retentionFor } from "@/server/recordings/store";
import { ALLOWED_AUDIO_MIME, baseMime } from "@/server/stt/mime";
import { buildSttPrompt } from "@/server/stt/prompt";
import { getSttProvider, sttConfigured } from "@/server/stt/provider";
import { getSurahMeta } from "@/lib/quran/surahs";
import { MAX_RECITATION_AYAHS, ayahRangeSchema } from "@/server/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "transcribe", session?.userId);

  const max = env.maxUploadBytes();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max + 64 * 1024) throw apiError(413, "payload_too_large");
  if (!sttConfigured()) throw apiError(503, "stt_unavailable");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw apiError(400, "invalid_request");
  }
  const audio = form.get("audio");
  if (!audio || typeof audio === "string") throw apiError(400, "invalid_request", "لم يُرسل ملف صوتي.");
  if (audio.size === 0) throw apiError(400, "invalid_request", "التسجيل فارغ.");
  if (audio.size > max) throw apiError(413, "payload_too_large");
  const mimeType = baseMime(audio.type || "");
  if (!ALLOWED_AUDIO_MIME.has(mimeType)) throw apiError(415, "unsupported_media_type");

  let range;
  try {
    range = ayahRangeSchema.parse(JSON.parse(String(form.get("range") ?? "")));
  } catch {
    throw apiError(400, "invalid_request", "نطاق الآيات غير صالح.");
  }
  if (range.to - range.from + 1 > MAX_RECITATION_AYAHS) throw apiError(400, "range_too_large");

  const buffer = await audio.arrayBuffer();
  const provider = getSttProvider();
  let transcript;
  try {
    // The prompt only describes the KIND of audio (and at most the surah's name). The expected verse
    // text is never sent: the transcript must reflect what was said, not what was expected.
    const prompt = buildSttPrompt(env.sttPrompt(), { surahName: getSurahMeta(range.surah)?.nameAr });
    transcript = await provider.transcribe({ audio: buffer, mimeType, language: "ar", prompt });
    if (env.sttTrace()) {
      // Developer diagnostics only (STT_TRACE=on): transcript TEXT and request parameters — never audio or keys.
      console.info(
        "[stt-trace] transcribe",
        JSON.stringify({
          provider: transcript.provider,
          prompt: prompt ?? null,
          bytes: buffer.byteLength,
          durationSec: transcript.durationSec,
          text: transcript.text,
          words: transcript.words?.map((w) => ({ t: w.text, c: w.confidence, s: w.start })),
          evidence: transcript.evidence,
        }),
      );
    }
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error(e.message);
      throw new ApiError(502, "stt_unavailable", "تعذّر تحويل التسجيل إلى نص الآن. حاول مجددًا أو استخدم التعرّف من المتصفح.");
    }
    throw e;
  }

  // Opt-in retention only (default: nothing is stored).
  if (session) {
    try {
      const expiresAt = await retentionFor(session.userId);
      if (expiresAt) {
        const key = await getRecordingStore().put(session.userId, buffer, mimeType);
        const { getPrisma } = await import("@/server/db");
        const prisma = await getPrisma();
        await prisma.recitationSession.create({
          data: {
            userId: session.userId,
            surah: range.surah,
            fromAyah: range.from,
            toAyah: range.to,
            provider: provider.id,
            durationSec: transcript.durationSec ?? null,
            audioStorageKey: key,
            audioMimeType: mimeType,
            audioExpiresAt: expiresAt,
          },
        });
      }
    } catch (e) {
      console.warn("[recordings] retention failed (audio not kept):", (e as Error).message);
    }
  }

  return json(transcript);
});
