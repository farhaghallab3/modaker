/**
 * Microphone access + level meter shared by every recognizer.
 * Nothing here records or keeps audio; the analyser only reads amplitude.
 */
import { SpeechError } from "./types";

export function hasGetUserMedia(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && (typeof window === "undefined" || window.isSecureContext !== false);
}

/** Map getUserMedia DOMExceptions to stable codes. */
export function micError(e: unknown): SpeechError {
  const name = (e as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return new SpeechError("permission-denied", undefined, e);
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return new SpeechError("no-microphone", undefined, e);
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return new SpeechError("mic-busy", undefined, e);
    case "TypeError":
    case "NotSupportedError":
      return new SpeechError("unsupported", undefined, e);
    default:
      return e instanceof SpeechError ? e : new SpeechError("unknown", (e as Error)?.message, e);
  }
}

export async function openMicrophone(): Promise<MediaStream> {
  if (!hasGetUserMedia()) throw new SpeechError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (e) {
    throw micError(e);
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* already stopped */
    }
  });
}

/**
 * RMS level meter over an AnalyserNode. Emits a smoothed 0..1 value per
 * animation frame. Fails soft: if Web Audio is unavailable it emits nothing.
 */
export function createLevelMeter(stream: MediaStream, onLevel: (level: number) => void) {
  type Ctor = typeof AudioContext;
  const AC: Ctor | undefined =
    typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) : undefined;
  if (!AC) return { close() {} };

  let ctx: AudioContext | null = null;
  let raf = 0;
  try {
    ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser); // not connected to destination: nothing is played back
    const buf = new Float32Array(analyser.fftSize);
    let smooth = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // speech RMS sits roughly in 0.01–0.25; map perceptually to 0..1
      const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-6) + 55) / 45));
      smooth = smooth * 0.7 + level * 0.3;
      onLevel(smooth);
      raf = requestAnimationFrame(tick);
    };
    void ctx.resume().catch(() => {});
    raf = requestAnimationFrame(tick);
  } catch {
    /* level meter is decorative — ignore */
  }
  return {
    close() {
      cancelAnimationFrame(raf);
      onLevel(0);
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
