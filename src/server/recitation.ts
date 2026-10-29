/** The word check on the server: loads the verified ayahs (never the client's text) and compares the transcript. */
import { OVERRUN_MIN_WORDS, analyzeRecitationWithOverrun, trailingExtraWords } from "@/lib/recitation/compare";
import { getSurahMeta } from "@/lib/quran/surahs";
import type { Ayah, AyahRange, RecitationAnalysis, Transcript } from "@/lib/types";
import { getQuranProvider } from "./quran/provider";
import { MAX_RECITATION_AYAHS } from "./validation";

export async function analyzeOnServer(range: AyahRange, transcript: Transcript): Promise<{ analysis: RecitationAnalysis; ayahs: Ayah[]; following: Ayah[] }> {
  const provider = getQuranProvider();
  const ayahs = await provider.getAyahs(range);
  // Recited past the end of the range? Load the following ayahs so those words are checked, not set aside.
  const ayahCount = getSurahMeta(range.surah)?.ayahCount ?? range.to;
  const lastAllowed = Math.min(ayahCount, range.from + MAX_RECITATION_AYAHS - 1);
  const following =
    range.to < lastAllowed && trailingExtraWords(ayahs, transcript) >= OVERRUN_MIN_WORDS
      ? await provider.getAyahs({ surah: range.surah, from: range.to + 1, to: lastAllowed })
      : [];
  return { analysis: analyzeRecitationWithOverrun(ayahs, following, transcript, range, MAX_RECITATION_AYAHS), ayahs, following };
}
