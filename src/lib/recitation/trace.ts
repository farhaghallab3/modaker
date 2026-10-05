/**
 * Stage-by-stage trace of one recitation analysis — a DIAGNOSTIC view of exactly what the pipeline
 * did, so a disputed result can be audited without guessing which layer is at fault:
 *
 *   1 raw transcription → 2 normalized tokens → 3 canonical Quran words → 4 alignment
 *   → 5 differences → 6 per-ayah score
 *
 * Pure: it never fetches, stores or logs anything, and carries no audio. (The transcript text is the
 * user's own speech; the caller decides whether to print it.)
 */
import { analyzeRecitation, align, buildExpected, buildRecognized } from "./compare";
import type { Ayah, AyahRange, RecitationAnalysis, Transcript } from "@/lib/types";

export interface RecitationTrace {
  /** 1 — exactly what the recognizer returned (words keep their spelling, timings and any confidence). */
  raw: { text: string; words?: Transcript["words"]; provider: string; language: string; evidence?: Transcript["evidence"] };
  /** 2 — the recognized words after normalization (diacritics/letter variants folded, alef-free match key). */
  normalized: { text: string; key: string }[];
  /** 3 — the canonical (verified) words, with the same normalization. */
  canonical: { ayah: number; wordIndex: number; display: string; key: string }[];
  /** 4 — the alignment between the two. */
  alignment: { op: string; expected?: { display: string; key: string }; heard?: { text: string; key: string }; similarity?: number }[];
  /** 5/6 — what was concluded. */
  analysis: RecitationAnalysis;
}

export function traceRecitation(ayahs: Ayah[], transcript: Transcript, range: AyahRange): RecitationTrace {
  const E = buildExpected(ayahs);
  const R = buildRecognized(transcript);
  const alignment = align(E, R).map((op) => {
    switch (op.t) {
      case "match":
        return {
          op: op.e.length === 1 && op.r.length === 1 ? "match" : op.e.length > 1 ? "match (1 spoken word = 2 expected)" : "match (2 spoken words = 1 expected)",
          expected: { display: op.e.map((i) => E[i].display).join(" "), key: op.e.map((i) => E[i].key).join("+") },
          heard: { text: op.r.map((i) => R[i].text).join(" "), key: op.r.map((i) => R[i].key).join("+") },
          similarity: Math.round(op.sim * 100) / 100,
        };
      case "sub":
        return { op: "SUBSTITUTION", expected: { display: E[op.e].display, key: E[op.e].key }, heard: { text: R[op.r].text, key: R[op.r].key }, similarity: Math.round(op.sim * 100) / 100 };
      case "del":
        return { op: "omitted", expected: { display: E[op.e].display, key: E[op.e].key } };
      default:
        return { op: "added", heard: { text: R[op.r].text, key: R[op.r].key } };
    }
  });
  return {
    raw: { text: transcript.text, words: transcript.words, provider: transcript.provider, language: transcript.language, evidence: transcript.evidence },
    normalized: R.map((r) => ({ text: r.text, key: r.key })),
    canonical: E.map((e) => ({ ayah: ayahs[e.ayahIdx].ayah, wordIndex: e.wordIdx, display: e.display, key: e.key })),
    alignment,
    analysis: analyzeRecitation(ayahs, transcript, range),
  };
}
