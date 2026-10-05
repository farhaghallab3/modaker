/**
 * Recognizer selection.
 *
 *   NEXT_PUBLIC_STT_MODE="browser" (default) → Web Speech on device,
 *                                              falling back to server upload
 *   NEXT_PUBLIC_STT_MODE="server"            → MediaRecorder → /recitation/transcribe
 *
 * Returns null when neither works (very old browsers / insecure origin).
 */
import { webSpeechRecognizer } from "./browser-web-speech";
import { serverUploadRecognizer } from "./server-upload";
import type { SpeechRecognizer } from "./types";

export type SttMode = "browser" | "server";

export function configuredSttMode(): SttMode {
  return process.env.NEXT_PUBLIC_STT_MODE === "server" ? "server" : "browser";
}

export function getRecognizer(mode: SttMode = configuredSttMode()): SpeechRecognizer | null {
  const order = mode === "server" ? [serverUploadRecognizer] : [webSpeechRecognizer, serverUploadRecognizer];
  return order.find((r) => r.isSupported()) ?? null;
}

/** The other recognizer, if usable — offered when one path fails (e.g. STT down). */
export function alternativeRecognizer(current: SpeechRecognizer): SpeechRecognizer | null {
  const other = current.id === webSpeechRecognizer.id ? serverUploadRecognizer : webSpeechRecognizer;
  return other.isSupported() ? other : null;
}

export { webSpeechRecognizer, serverUploadRecognizer };
export { SpeechError } from "./types";
export type { RecognitionSession, SpeechRecognizer, SpeechErrorCode } from "./types";
