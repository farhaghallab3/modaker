/**
 * Opt-in diagnostics for the recording → transcription pipeline.
 *
 * Enable in the browser console:   localStorage.setItem("muzakkir:stt-debug", "1")   (then reload)
 * or open any page with            ?sttdebug=1
 * Read the trace with              window.__muzakkirStt
 *
 * PRIVACY: events carry only states, counts, sizes, durations, levels and error codes. Never audio
 * data, never recognised text (only its LENGTH), never keys or user identifiers.
 */
type Value = number | string | boolean | null;

interface TraceEvent {
  t: number; // ms since the first event
  src: string;
  event: string;
  data?: Record<string, Value>;
}

declare global {
  interface Window {
    __muzakkirStt?: TraceEvent[];
  }
}

let enabled: boolean | null = null;
let t0 = 0;

export function sttDebugEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled =
      typeof window !== "undefined" &&
      (window.localStorage.getItem("muzakkir:stt-debug") === "1" || new URLSearchParams(window.location.search).has("sttdebug"));
  } catch {
    enabled = false;
  }
  return enabled;
}

export function sttLog(src: string, event: string, data?: Record<string, Value>) {
  if (!sttDebugEnabled()) return;
  if (!t0) t0 = performance.now();
  const entry: TraceEvent = { t: Math.round(performance.now() - t0), src, event, data };
  const trace = (window.__muzakkirStt ??= []);
  trace.push(entry);
  if (trace.length > 300) trace.shift();
  console.info(`[stt:${src}] ${event}`, data ?? "");
}
