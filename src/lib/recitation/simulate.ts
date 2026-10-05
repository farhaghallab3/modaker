/**
 * DEVELOPMENT ONLY — synthetic transcript for testing the feedback UI without
 * a microphone. Built exclusively from verses already loaded from the verified
 * source (normalized like STT output), with a few deliberate slips: one word
 * dropped, one word replaced by another word of the same passage, and a long
 * pause before one ayah (exercises hesitation detection).
 */
import { tokenize } from "@/lib/quran/normalize";
import type { Ayah, RecognizedWord, Transcript } from "@/lib/types";

export function simulateTranscript(ayahs: Ayah[], seed = 1): Transcript {
  const perAyah = ayahs.map((a) => tokenize(a.textSimple ?? a.textUthmani));
  const all = perAyah.flat();
  // deterministic pseudo-random
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  const out: string[][] = perAyah.map((ws) => [...ws]);
  if (all.length >= 6) {
    // drop a word from the first ayah long enough (keep its first word)
    const dropIn = out.findIndex((ws) => ws.length >= 3);
    if (dropIn >= 0) out[dropIn].splice(1 + Math.floor(rand() * (out[dropIn].length - 1)), 1);
    // replace a word in a later ayah with a different word from the passage
    const subIn = out.length > 1 ? out.length - 1 : 0;
    const ws = out[subIn];
    if (ws.length >= 2) {
      const at = Math.floor(rand() * ws.length);
      const other = all.find((w, i) => w !== ws[at] && w.length >= 3 && i % 3 === Math.floor(rand() * 3)) ?? all.find((w) => w !== ws[at]);
      if (other) ws[at] = other;
    }
  }

  const words: RecognizedWord[] = [];
  let t = 0.6;
  const pauseBefore = out.length > 2 ? 1 : -1;
  out.forEach((ws, ai) => {
    if (ai === pauseBefore) t += 4.2;
    for (const w of ws) {
      const dur = 0.32 + w.length * 0.06;
      words.push({ text: w, start: round(t), end: round(t + dur) });
      t += dur + 0.12;
    }
    t += 0.7;
  });

  return {
    text: words.map((w) => w.text).join(" "),
    words,
    provider: "dev:simulation",
    language: "ar",
    durationSec: round(t),
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
