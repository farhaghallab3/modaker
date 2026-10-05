/** Audio MIME helpers shared by the upload route and STT providers. */

/** Audio types accepted by the upload route (browsers record webm/ogg/mp4). */
export const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "video/webm", // some browsers label audio-only MediaRecorder output as video/webm
]);

/** "audio/webm;codecs=opus" → "audio/webm" */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function extensionFor(mime: string): string {
  const m = baseMime(mime);
  if (m.endsWith("webm")) return "webm";
  if (m.endsWith("ogg")) return "ogg";
  if (m === "audio/mp4" || m.endsWith("m4a")) return "m4a";
  if (m.endsWith("mpeg") || m.endsWith("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.endsWith("flac")) return "flac";
  return "bin";
}
