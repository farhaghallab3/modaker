/**
 * POST /api/v1/recitation/tajweed  (multipart/form-data)
 *   audio: Blob (≤ 15 MB, audio/* allowlist)   range: JSON AyahRange
 *   → { notes: TajweedNote[], matched, speech }
 *   speech: what the teacher says about the first notes, signed for /assistant/speech (null when the voice is off).
 *   Written here from the notes (ayah/word numbers, letter names, rules), never Quran words.
 * GET → { enabled }
 *
 * Runs next to /transcribe on the same recording: the word check answers first, the tajweed notes follow.
 * Privacy: audio is held in memory, sent to the tajweed checker (TAJWEED_URL) and discarded. Never stored.
 */
import { optionalSession } from "@/server/auth";
import { env } from "@/server/env";
import { ApiError, ProviderError, apiError } from "@/server/errors";
import { enforceRateLimit, json, route } from "@/server/http";
import { ALLOWED_AUDIO_MIME, baseMime } from "@/server/stt/mime";
import { checkTajweed, tajweedConfigured, wakeTajweed } from "@/server/tajweed";
import { speechForText } from "@/server/tts/speech";
import { tajweedSpeech } from "@/lib/recitation/tajweed-notes";
import { MAX_RECITATION_AYAHS, ayahRangeSchema } from "@/server/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET → { enabled }. Called when the recite screen opens; also wakes the free checker if it fell asleep. */
export const GET = route(async () => {
  const enabled = tajweedConfigured();
  if (enabled) await wakeTajweed();
  return json({ enabled }, { headers: { "cache-control": "no-store" } });
});

export const POST = route(async (req) => {
  const session = await optionalSession(req);
  enforceRateLimit(req, "tajweed", session?.userId);
  if (!tajweedConfigured()) throw apiError(503, "tajweed_unavailable");

  const max = env.maxUploadBytes();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max + 64 * 1024) throw apiError(413, "payload_too_large");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw apiError(400, "invalid_request");
  }
  const audio = form.get("audio");
  if (!audio || typeof audio === "string" || audio.size === 0) throw apiError(400, "invalid_request", "لم يُرسل ملف صوتي.");
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

  try {
    const result = await checkTajweed(await audio.arrayBuffer(), mimeType, range);
    const lines = tajweedSpeech(result.notes).map((t) => speechForText(t));
    return json({ ...result, speech: lines.length && lines.every(Boolean) ? lines : null });
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error(e.message);
      throw new ApiError(502, "tajweed_unavailable", "تعذّر فحص التجويد الآن. حاول مرة أخرى بعد قليل.");
    }
    throw e;
  }
});
