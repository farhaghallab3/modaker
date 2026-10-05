/**
 * Integrity checks for Quran text coming from any provider. Text that fails
 * is never served: providers throw QuranVerificationError instead.
 *
 * What we can verify without embedding Quran text in the repo:
 *  - ayah count equals the Hafs metadata in src/lib/quran/surahs.ts
 *  - keys are sequential "s:1".."s:N" and belong to the requested surah
 *  - every ayah has non-empty text with Arabic letters
 *  - a SHA-256 checksum (per ayah and per surah) so re-imports and caches can
 *    be compared against the value stored at import time.
 */
import { createHash } from "node:crypto";
import { getSurahMeta } from "@/lib/quran/surahs";
import type { Ayah, SurahText } from "@/lib/types";
import { QuranVerificationError } from "../errors";

export interface VerificationResult {
  ok: boolean;
  problems: string[];
  /** sha256 over "key\ttext\n" lines — stable across providers using the same script */
  checksum: string;
  ayahCount: number;
}

const ARABIC_LETTER = /[ء-يٱ-ۓ]/;

export function ayahChecksum(ayah: Pick<Ayah, "key" | "textUthmani">): string {
  return createHash("sha256").update(`${ayah.key}\t${ayah.textUthmani.normalize("NFC")}`).digest("hex");
}

export function surahChecksum(ayahs: Pick<Ayah, "key" | "textUthmani">[]): string {
  const h = createHash("sha256");
  for (const a of ayahs) h.update(`${a.key}\t${a.textUthmani.normalize("NFC")}\n`);
  return h.digest("hex");
}

export function verifySurahText(text: SurahText): VerificationResult {
  const problems: string[] = [];
  const n = text.meta?.number;
  const meta = getSurahMeta(n);
  if (!meta) {
    problems.push(`unknown surah number ${n}`);
  } else {
    if (text.ayahs.length !== meta.ayahCount) {
      problems.push(`surah ${n}: expected ${meta.ayahCount} ayahs, got ${text.ayahs.length}`);
    }
  }
  text.ayahs.forEach((a, i) => {
    const expectedKey = `${n}:${i + 1}`;
    if (a.surah !== n || a.ayah !== i + 1 || a.key !== expectedKey) {
      problems.push(`position ${i + 1}: expected key ${expectedKey}, got ${a.key} (${a.surah}:${a.ayah})`);
    }
    if (!a.textUthmani || !a.textUthmani.trim()) problems.push(`${a.key}: empty text`);
    else if (!ARABIC_LETTER.test(a.textUthmani)) problems.push(`${a.key}: no Arabic letters`);
  });
  if (!text.source?.id) problems.push("missing source reference");

  return { ok: problems.length === 0, problems, checksum: surahChecksum(text.ayahs), ayahCount: text.ayahs.length };
}

/** Verify and return the text, or throw QuranVerificationError. */
export function assertVerified(text: SurahText, expectedChecksum?: string | null): SurahText {
  const r = verifySurahText(text);
  if (expectedChecksum && r.checksum !== expectedChecksum) {
    r.problems.push(`surah ${text.meta?.number}: checksum mismatch (stored ${expectedChecksum.slice(0, 12)}…, got ${r.checksum.slice(0, 12)}…)`);
  }
  if (r.problems.length) {
    throw new QuranVerificationError(`Quran text for surah ${text.meta?.number} failed verification`, r.problems);
  }
  return text;
}
