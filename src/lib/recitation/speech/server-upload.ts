/**
 * Records with MediaRecorder and uploads once to POST /recitation/transcribe.
 * The Blob lives in memory only until the request completes; nothing is
 * written to storage on the device.
 */
import { api, ApiError } from "@/lib/api";
import type { Transcript } from "@/lib/types";
import { createLevelMeter, hasGetUserMedia, openMicrophone, stopStream } from "./microphone";
import { emitter, SpeechError, type RecognitionSession, type SpeechRecognizer } from "./types";

const CANDIDATE_MIME = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of CANDIDATE_MIME) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* Safari < 14.1 throws */
    }
  }
  return "";
}

/** Map API error codes (docs/ARCHITECTURE-backend.md) to speech error codes. */
export function speechErrorFromApi(e: unknown): SpeechError {
  if (e instanceof SpeechError) return e;
  if (e instanceof ApiError) {
    switch (e.code) {
      case "stt_unavailable":
      case "provider_error":
        return new SpeechError("stt-unavailable", e.message, e);
      case "rate_limited":
        return new SpeechError("rate-limited", e.message, e);
      case "payload_too_large":
        return new SpeechError("too-long", e.message, e);
      case "range_too_large":
        return new SpeechError("range-too-large", e.message, e);
      case "unsupported_media_type":
        return new SpeechError("unsupported-format", e.message, e);
      default:
        return new SpeechError(e.status >= 500 ? "stt-unavailable" : "unknown", e.message, e);
    }
  }
  // fetch() rejects with TypeError when offline / network down
  return new SpeechError("network", (e as Error)?.message, e);
}

export const serverUploadRecognizer: SpeechRecognizer = {
  id: "server-upload",
  streamsInterim: false,
  isSupported() {
    return typeof MediaRecorder !== "undefined" && hasGetUserMedia();
  },
  createSession({ language, range }) {
    const levels = emitter<number>();
    const errors = emitter<SpeechError>();
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let meter: { close(): void } | null = null;
    let chunks: Blob[] = [];
    let t0 = 0;
    let cancelled = false;

    function release() {
      meter?.close();
      meter = null;
      stopStream(stream);
      stream = null;
    }

    const session: RecognitionSession = {
      async start() {
        if (typeof MediaRecorder === "undefined") throw new SpeechError("unsupported");
        stream = await openMicrophone();
        meter = createLevelMeter(stream, levels.emit);
        const mimeType = pickMimeType();
        try {
          recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
        } catch (e) {
          release();
          throw new SpeechError("unsupported", (e as Error)?.message, e);
        }
        chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = () => {
          release();
          errors.emit(new SpeechError("mic-busy"));
        };
        t0 = performance.now();
        recorder.start(1000);
      },

      async stop(): Promise<Transcript> {
        const r = recorder;
        const durationSec = Math.round(((performance.now() - t0) / 1000) * 10) / 10;
        if (!r) throw new SpeechError("unknown", "not started");
        await new Promise<void>((resolve) => {
          if (r.state === "inactive") return resolve();
          r.onstop = () => resolve();
          try {
            r.stop();
          } catch {
            resolve();
          }
        });
        release();
        recorder = null;
        levels.clear();
        if (cancelled) throw new SpeechError("unknown", "cancelled");

        const type = (r.mimeType || chunks[0]?.type || "audio/webm").split(";")[0];
        let blob: Blob | null = new Blob(chunks, { type });
        chunks = [];
        if (blob.size === 0) return { text: "", provider: "server", language, durationSec };
        try {
          const t = await api.transcribe(blob, range);
          return { ...t, durationSec: t.durationSec ?? durationSec };
        } catch (e) {
          throw speechErrorFromApi(e);
        } finally {
          blob = null; // drop the only reference — audio is never kept client-side
        }
      },

      cancel() {
        cancelled = true;
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch {
          /* ignore */
        }
        recorder = null;
        chunks = [];
        release();
        levels.clear();
        errors.clear();
      },

      onLevel: levels.on,
      onError: errors.on,
    };
    return session;
  },
};
