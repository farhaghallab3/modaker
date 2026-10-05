/**
 * Records with MediaRecorder and uploads once to POST /recitation/transcribe.
 * The Blob lives in memory only until the request completes; nothing is
 * written to storage on the device.
 */
import { api, ApiError } from "@/lib/api";
import type { Transcript } from "@/lib/types";
import { createLevelMeter, hasGetUserMedia, openMicrophone, stopStream } from "./microphone";
import { sttLog } from "./diagnostics";
import { classifyEmptyTranscript } from "./empty-result";
import { emitter, SpeechError, type RecognitionSession, type SpeechRecognizer } from "./types";

/** Anything smaller than this cannot contain speech (a webm/opus header alone is a few hundred bytes). */
const MIN_AUDIO_BYTES = 800;

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
      case "invalid_request":
        // the server refused the upload itself (empty file, malformed range): not a "didn't hear you"
        return new SpeechError(e.status === 400 ? "no-audio" : "unknown", e.message, e);
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
    let peak = 0; // loudest mic level seen — tells real silence from a recognition failure
    let chunkCount = 0;
    let totalBytes = 0;

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
        const track = stream.getAudioTracks()[0];
        sttLog("upload", "mic-open", { tracks: stream.getAudioTracks().length, trackState: track?.readyState ?? null, muted: track?.muted ?? null, enabled: track?.enabled ?? null });
        meter = createLevelMeter(stream, (l) => {
          peak = Math.max(peak, l);
          levels.emit(l);
        });
        const mimeType = pickMimeType();
        sttLog("upload", "mime-selected", { mimeType: mimeType || "(browser default)", MediaRecorder: typeof MediaRecorder !== "undefined" });
        try {
          recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
        } catch (e) {
          release();
          throw new SpeechError("unsupported", (e as Error)?.message, e);
        }
        chunks = [];
        chunkCount = 0;
        totalBytes = 0;
        peak = 0;
        recorder.ondataavailable = (e) => {
          chunkCount++;
          totalBytes += e.data?.size ?? 0;
          sttLog("upload", "dataavailable", { n: chunkCount, bytes: e.data?.size ?? 0, type: e.data?.type ?? null });
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstart = () => sttLog("upload", "recorder-start", { state: recorder?.state ?? null, mimeType: recorder?.mimeType ?? null });
        recorder.onerror = (ev) => {
          sttLog("upload", "recorder-error", { name: (ev as unknown as { error?: { name?: string } }).error?.name ?? null });
          release();
          errors.emit(new SpeechError("mic-busy"));
        };
        t0 = performance.now();
        recorder.start(1000);
        sttLog("upload", "recorder-started", { state: recorder.state });
      },

      async stop(): Promise<Transcript> {
        const r = recorder;
        const durationSec = Math.round(((performance.now() - t0) / 1000) * 10) / 10;
        if (!r) throw new SpeechError("unknown", "not started");
        sttLog("upload", "stop-requested", { state: r.state, durationSec, chunksSoFar: chunkCount });
        // Wait for the recorder's own `stop` event: the FINAL dataavailable fires before it, so the
        // last chunk is in `chunks` by the time this resolves.
        await new Promise<void>((resolve) => {
          if (r.state === "inactive") return resolve();
          r.onstop = () => resolve();
          try {
            r.stop();
          } catch {
            resolve();
          }
        });
        sttLog("upload", "recorder-stopped", { state: r.state, chunks: chunkCount, totalBytes, peakLevel: Math.round(peak * 100) / 100 });
        release();
        recorder = null;
        levels.clear();
        if (cancelled) throw new SpeechError("unknown", "cancelled");

        const type = (r.mimeType || chunks[0]?.type || "audio/webm").split(";")[0];
        let blob: Blob | null = new Blob(chunks, { type });
        chunks = [];
        sttLog("upload", "blob-built", { bytes: blob.size, type, durationSec, peakLevel: Math.round(peak * 100) / 100 });
        // Nothing to send: say so. (This used to return an empty transcript, which the UI then
        // reported as «لم نسمع تلاوة واضحة» even though no request was ever made.)
        if (blob.size < MIN_AUDIO_BYTES) {
          sttLog("upload", "no-audio-abort", { bytes: blob.size, chunks: chunkCount });
          throw new SpeechError("no-audio", `recorded ${blob.size} bytes in ${chunkCount} chunk(s)`);
        }
        try {
          sttLog("upload", "post-start", { bytes: blob.size });
          const started = performance.now();
          const t = await api.transcribe(blob, range);
          sttLog("upload", "post-ok", { ms: Math.round(performance.now() - started), textLength: t.text?.length ?? 0, words: t.words?.length ?? 0, provider: t.provider });
          // The request happened and the service answered with no text. If the mic clearly heard sound
          // that is a recognition failure, not silence.
          if (!t.text?.trim()) {
            const err = classifyEmptyTranscript(peak, "server returned no text for audible audio");
            if (err) throw err;
          }
          return { ...t, durationSec: t.durationSec ?? durationSec };
        } catch (e) {
          sttLog("upload", "post-failed", { code: e instanceof SpeechError ? e.code : ((e as { code?: string })?.code ?? "error"), status: (e as { status?: number })?.status ?? null });
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
