/**
 * Extracting REAL confidence evidence from what the transcription API returns. Nothing here
 * estimates or invents confidence: if the API does not provide a number, no number is produced.
 *
 *  - Whisper (whisper-1, verbose_json) gives decoding statistics per SEGMENT (not per word). We keep
 *    the segments whose statistics cross Whisper's own documented "unreliable decode" thresholds.
 *  - The GPT-4o transcribers (gpt-4o-transcribe / gpt-4o-mini-transcribe) give per-TOKEN
 *    log-probabilities (include=logprobs). We group tokens back into words.
 */
import type { RecognizedWord, TranscriptEvidence } from "@/lib/types";

/** Whisper's reference decoding-fallback thresholds. */
export const WHISPER_MIN_AVG_LOGPROB = -1.0;
export const WHISPER_MAX_COMPRESSION_RATIO = 2.4;
export const WHISPER_MAX_NO_SPEECH_PROB = 0.6;

export interface WhisperSegment {
  start: number;
  end: number;
  avg_logprob: number;
  no_speech_prob: number;
  compression_ratio: number;
}

export function segmentEvidence(segments: WhisperSegment[] | undefined): TranscriptEvidence {
  if (!segments?.length) return { kind: "none" };
  const low = segments
    .filter((s) => s.avg_logprob < WHISPER_MIN_AVG_LOGPROB || s.compression_ratio > WHISPER_MAX_COMPRESSION_RATIO || s.no_speech_prob > WHISPER_MAX_NO_SPEECH_PROB)
    .map((s) => ({ start: s.start, end: s.end, avgLogprob: s.avg_logprob, noSpeechProb: s.no_speech_prob, compressionRatio: s.compression_ratio }));
  return { kind: "segment-logprobs", lowConfidenceSegments: low };
}

export interface TokenLogprob {
  token: string;
  logprob: number;
  bytes?: number[] | null;
}

const isSpace = (b: number) => b === 0x20 || b === 0x0a || b === 0x09 || b === 0x0d;

/**
 * Group token log-probabilities into words. A word's confidence is the geometric mean of its tokens'
 * probabilities, exp(mean(logprob)) — a real number derived from the API's own output.
 */
export function wordsFromLogprobs(tokens: TokenLogprob[]): RecognizedWord[] {
  const words: { bytes: number[]; lps: number[] }[] = [];
  let cur: { bytes: number[]; lps: number[] } | null = null;
  for (const t of tokens) {
    const bytes = t.bytes?.length ? t.bytes : [...new TextEncoder().encode(t.token)];
    let attached = false;
    for (const b of bytes) {
      if (isSpace(b)) {
        cur = null;
        continue;
      }
      if (!cur) {
        cur = { bytes: [], lps: [] };
        words.push(cur);
      }
      cur.bytes.push(b);
      if (!attached) {
        cur.lps.push(t.logprob);
        attached = true;
      }
    }
  }
  const dec = new TextDecoder("utf-8", { fatal: false });
  return words
    .map((w) => ({ text: dec.decode(new Uint8Array(w.bytes)).trim(), confidence: Math.exp(w.lps.reduce((s, x) => s + x, 0) / Math.max(1, w.lps.length)) }))
    .filter((w) => w.text)
    .map((w) => ({ text: w.text, confidence: Math.round(w.confidence * 1000) / 1000 }));
}
