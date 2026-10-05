/**
 * On-device recognition through the Web Speech API (Chrome/Edge/Safari).
 *
 * - lang ar-SA, continuous + interimResults
 * - stamps each result's first-heard / finalized time → approximate word timings
 * - Chrome ends recognition after a few seconds of silence: while the user is
 *   still reciting we transparently restart it
 * - opens its own mic stream only for the level meter and for clear
 *   permission errors; the stream is always stopped on stop/cancel
 */
import type { Transcript } from "@/lib/types";
import { createLevelMeter, hasGetUserMedia, openMicrophone, stopStream } from "./microphone";
import { segmentsToWords, type TimedSegment } from "./timing";
import { classifyEmptyTranscript } from "./empty-result";
import { sttLog } from "./diagnostics";
import { emitter, SpeechError, type RecognitionSession, type SpeechRecognizer } from "./types";

// ── Minimal Web Speech typings (not in lib.dom for all TS versions) ─────
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [i: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  [i: number]: SRResult;
}
interface SREvent extends Event {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
interface SRErrorEvent extends Event {
  readonly error: string;
}
interface SR extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SR;

function getCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MAX_RAPID_RESTARTS = 6;

export const webSpeechRecognizer: SpeechRecognizer = {
  id: "web-speech",
  streamsInterim: true,
  isSupported() {
    return !!getCtor() && hasGetUserMedia();
  },
  createSession({ language }) {
    const Ctor = getCtor();
    const levels = emitter<number>();
    const interims = emitter<string>();
    const errors = emitter<SpeechError>();

    let rec: SR | null = null;
    let stream: MediaStream | null = null;
    let meter: { close(): void } | null = null;
    let t0 = 0;
    let active = false; // user is reciting (restart on silence end)
    let finished = false;
    let rapidRestarts = 0;
    let lastStartAt = 0;
    let fatal: SpeechError | null = null;
    let endWaiter: (() => void) | null = null;
    let peak = 0; // loudest mic level seen
    let resultEvents = 0;
    let lastEngineError: string | null = null;

    const finals: TimedSegment[] = [];
    // per-instance bookkeeping (result indices reset on every restart)
    let firstSeen = new Map<number, number>();
    let finalized = new Set<number>();
    let pendingInterim = "";

    const now = () => (performance.now() - t0) / 1000;

    function teardown() {
      active = false;
      meter?.close();
      meter = null;
      stopStream(stream);
      stream = null;
      if (rec) {
        rec.onresult = rec.onerror = rec.onend = rec.onstart = null;
        rec.onaudiostart = rec.onsoundstart = rec.onspeechstart = rec.onspeechend = rec.onnomatch = null;
        try {
          rec.abort();
        } catch {
          /* not started */
        }
      }
      rec = null;
    }

    function fail(err: SpeechError) {
      if (finished) return;
      fatal = err;
      teardown();
      finished = true;
      errors.emit(err);
      endWaiter?.();
    }

    function spawn() {
      if (!Ctor) return;
      const r = new Ctor();
      r.lang = language;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      firstSeen = new Map();
      finalized = new Set();
      lastStartAt = performance.now();

      r.onstart = () => sttLog("web-speech", "engine-start", { lang: r.lang });
      r.onaudiostart = () => sttLog("web-speech", "audiostart");
      r.onsoundstart = () => sttLog("web-speech", "soundstart");
      r.onspeechstart = () => sttLog("web-speech", "speechstart");
      r.onspeechend = () => sttLog("web-speech", "speechend");
      r.onnomatch = () => sttLog("web-speech", "nomatch");

      r.onresult = (e) => {
        resultEvents++;
        sttLog("web-speech", "result", { results: e.results.length, resultIndex: e.resultIndex, final: Boolean(e.results[e.results.length - 1]?.isFinal) });
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = (res[0]?.transcript ?? "").trim();
          if (!firstSeen.has(i)) firstSeen.set(i, now());
          if (res.isFinal) {
            if (!finalized.has(i) && text) {
              finalized.add(i);
              finals.push({ text, start: firstSeen.get(i) ?? now(), end: now() });
            }
          } else {
            interim += (interim ? " " : "") + text;
          }
        }
        pendingInterim = interim;
        const shown = [...finals.map((f) => f.text), interim].filter(Boolean).join(" ");
        interims.emit(shown);
      };

      r.onerror = (e) => {
        lastEngineError = e.error;
        sttLog("web-speech", "engine-error", { error: e.error });
        switch (e.error) {
          case "not-allowed":
          case "service-not-allowed":
            return fail(new SpeechError("permission-denied"));
          case "audio-capture":
            return fail(new SpeechError("no-microphone"));
          case "network":
            return fail(new SpeechError("network"));
          case "language-not-supported":
            return fail(new SpeechError("unsupported"));
          // "no-speech" and "aborted" are routine; onend decides whether to restart.
          default:
            return;
        }
      };

      r.onend = () => {
        sttLog("web-speech", "engine-end", { active, restarts: rapidRestarts, finals: finals.length });
        // keep text that never got finalized before the engine stopped
        if (pendingInterim) {
          finals.push({ text: pendingInterim, start: now() - 1, end: now() });
          pendingInterim = "";
        }
        if (active && !finished) {
          const quick = performance.now() - lastStartAt < 1500;
          rapidRestarts = quick ? rapidRestarts + 1 : 0;
          if (rapidRestarts > MAX_RAPID_RESTARTS) return fail(new SpeechError("stt-unavailable"));
          try {
            spawn();
          } catch (err) {
            fail(new SpeechError("unknown", (err as Error)?.message, err));
          }
          return;
        }
        endWaiter?.();
      };

      rec = r;
      r.start();
    }

    const session: RecognitionSession = {
      async start() {
        if (!Ctor) throw new SpeechError("unsupported");
        // Ask for the mic explicitly: clear NotAllowed/NotFound errors + level meter.
        stream = await openMicrophone();
        meter = createLevelMeter(stream, (l) => {
          peak = Math.max(peak, l);
          levels.emit(l);
        });
        sttLog("web-speech", "mic-open", { tracks: stream.getAudioTracks().length });
        t0 = performance.now();
        active = true;
        try {
          spawn();
        } catch (e) {
          teardown();
          throw new SpeechError("unsupported", (e as Error)?.message, e);
        }
      },

      async stop(): Promise<Transcript> {
        const duration = now();
        if (!finished && rec) {
          active = false;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2500); // engines may never fire onend
            endWaiter = () => {
              clearTimeout(timer);
              resolve();
            };
            try {
              rec!.stop();
            } catch {
              resolve();
            }
          });
        }
        if (pendingInterim) {
          finals.push({ text: pendingInterim, start: duration - 1, end: duration });
          pendingInterim = "";
        }
        finished = true;
        teardown();
        levels.clear();
        interims.clear();
        const text = finals.map((f) => f.text).join(" ").trim();
        sttLog("web-speech", "stopped", { durationSec: Math.round(duration * 10) / 10, textLength: text.length, resultEvents, lastEngineError, peakLevel: Math.round(peak * 100) / 100, fatal: fatal?.code ?? null });
        if (fatal) throw fatal;
        // The engine produced nothing. If the microphone clearly heard sound, say THAT instead of
        // «we didn't hear you» — the recognition service failed, not the user.
        if (!text) {
          const err = classifyEmptyTranscript(peak, `browser recognition returned no text (engine: ${lastEngineError ?? "no error"})`);
          if (err) throw err;
        }
        const words = segmentsToWords(finals);
        return {
          text,
          words: words.length ? words : undefined,
          provider: "browser:web-speech",
          language,
          durationSec: Math.round(duration * 10) / 10,
        };
      },

      cancel() {
        finished = true;
        teardown();
        endWaiter?.();
        levels.clear();
        interims.clear();
        errors.clear();
      },

      onLevel: levels.on,
      onInterim: interims.on,
      onError: errors.on,
    };
    return session;
  },
};
