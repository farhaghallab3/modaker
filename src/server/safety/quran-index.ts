/**
 * Builds (once per process) the quotation index from the verified Quran provider.
 * Every surah is loaded through the provider, so it has already passed count + checksum
 * verification; the index is never built from anything else.
 */
import type { Ayah } from "@/lib/types";
import type { QuranProvider } from "../quran/common";
import { QuranQuoteIndex } from "./quote-verifier";

const g = globalThis as unknown as { __muzakkirQuoteIndex?: Map<string, Promise<QuranQuoteIndex>> };

async function build(provider: QuranProvider): Promise<QuranQuoteIndex> {
  const ayahs: Ayah[] = [];
  const surahs = Array.from({ length: 114 }, (_, i) => i + 1);
  for (let i = 0; i < surahs.length; i += 6) {
    const batch = await Promise.all(surahs.slice(i, i + 6).map((n) => provider.getSurah(n)));
    for (const s of batch) ayahs.push(...s.ayahs);
  }
  return new QuranQuoteIndex(ayahs);
}

export function getQuranQuoteIndex(provider: QuranProvider): Promise<QuranQuoteIndex> {
  const cache = (g.__muzakkirQuoteIndex ??= new Map());
  let p = cache.get(provider.id);
  if (!p) {
    p = build(provider).catch((e) => {
      cache.delete(provider.id); // never cache a failed build
      throw e;
    });
    cache.set(provider.id, p);
  }
  return p;
}
