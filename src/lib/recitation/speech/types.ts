/**
 * Client speech-recognition contract (adapter pattern).
 *
 * The recitation UI talks only to these interfaces; concrete recognizers
 * (on-device Web Speech, or MediaRecorder → server STT) live beside this file
 * and are picked by `getRecognizer()` in ./index.ts.
 *
 * Privacy: implementations keep audio in memory only for the duration of a
 * session and never persist it on the device.
 */
import type { AyahRange, Transcript } from "@/lib/types";

export type SpeechErrorCode =
  | "permission-denied" // NotAllowedError / SecurityError — user or policy blocked the mic
  | "no-microphone" // NotFoundError / audio-capture
  | "mic-busy" // NotReadableError — another app holds the device
  | "unsupported" // no MediaRecorder / Web Speech / getUserMedia, or insecure context
  | "network" // offline or request failed
  | "stt-unavailable" // server STT provider down / not configured (stt_unavailable)
  | "rate-limited" // rate_limited
  | "too-long" // payload_too_large
  | "range-too-large" // range_too_large
  | "unsupported-format" // unsupported_media_type
  | "no-speech" // the session ended with an empty transcript AND the microphone level stayed low (real silence)
  | "no-audio" // the recorder produced no audio data at all (nothing to send)
  | "engine-no-result" // sound was clearly picked up, but recognition returned no text
  | "unknown";

export class SpeechError extends Error {
  constructor(
    public code: SpeechErrorCode,
    message?: string,
    public cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "SpeechError";
  }
}

/** Unsubscribe function returned by every listener registration. */
export type Unsubscribe = () => void;

export interface RecognitionSession {
  /** Ask for the microphone and begin capturing. Rejects with SpeechError. */
  start(): Promise<void>;
  /** Finish capturing and resolve with the transcript. Releases the mic. */
  stop(): Promise<Transcript>;
  /** Abort without producing a transcript. Releases the mic. Idempotent. */
  cancel(): void;
  /** Mic input level 0..1, ~60 Hz while recording. */
  onLevel?(cb: (level: number) => void): Unsubscribe;
  /** Live (non-final) transcript — only recognizers that stream text provide it. */
  onInterim?(cb: (text: string) => void): Unsubscribe;
  /** Fatal error while recording (the session is already torn down). */
  onError?(cb: (err: SpeechError) => void): Unsubscribe;
}

export interface SpeechRecognizer {
  /** "web-speech" | "server-upload" */
  id: string;
  /** Whether this recognizer can work in the current browser. */
  isSupported(): boolean;
  /** True when text streams live while reciting (enables the interim line). */
  streamsInterim: boolean;
  createSession(opts: { language: "ar-SA"; range: AyahRange }): RecognitionSession;
}

/** Tiny typed event hub used by implementations. */
export function emitter<T>() {
  const subs = new Set<(v: T) => void>();
  return {
    on(cb: (v: T) => void): Unsubscribe {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    emit(v: T) {
      subs.forEach((cb) => cb(v));
    },
    clear() {
      subs.clear();
    },
  };
}
