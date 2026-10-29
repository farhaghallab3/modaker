/**
 * One word of the Quran in a human reciter's voice, from Quran.com's word-by-word audio
 * (audio.qurancdn.com/wbw/SSS_AAA_WWW.mp3, the same files Quran.com plays when a word is tapped).
 * Word numbers follow Quran.com's Uthmani text, which is also Modaker's text: callers only use this
 * when the checker's word count for the ayah agrees with Modaker's (see noteWord).
 */
export const WORD_AUDIO_BASE = "https://audio.qurancdn.com/wbw";

const pad = (n: number) => String(n).padStart(3, "0");

/** wordIndex is 0-based inside the ayah. */
export function wordAudioUrl(surah: number, ayah: number, wordIndex: number): string {
  return `${WORD_AUDIO_BASE}/${pad(surah)}_${pad(ayah)}_${pad(wordIndex + 1)}.mp3`;
}
