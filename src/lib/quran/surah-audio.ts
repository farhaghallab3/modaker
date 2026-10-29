/**
 * Whole-surah recordings (one file per surah, like a Quran app or a music player) with the time where each ayah
 * starts and ends, from mp3quran.net (cdn.mp3quran.net, timings from mp3quran.net/api/v3/ayat_timing).
 * Playing from these files sounds continuous: the reciter's own breath between ayahs, no cut and no gap.
 * Reciters without a whole-surah file with timings keep the ayah-by-ayah files (reciters.ts).
 *
 * Each entry is the same reciter and the same recitation style as the ayah-by-ayah folder in reciters.ts.
 */

/** reciter id (reciters.ts) → mp3quran "read" id and its folder (both from mp3quran.net/api/v3/ayat_timing/reads). */
export const SURAH_AUDIO: Record<string, { read: number; folder: string }> = {
  alafasy: { read: 123, folder: "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/" },
  minshawi: { read: 112, folder: "https://cdn.mp3quran.net/audio/muhammad-minshawi/r1/" },
  tablawi: { read: 106, folder: "https://cdn.mp3quran.net/audio/muhammad-tablawi/r1/" },
  qatami: { read: 86, folder: "https://cdn.mp3quran.net/audio/nasser-qatami/r1/" },
  shatri: { read: 4, folder: "https://cdn.mp3quran.net/audio/abubakr-shatri/r1/" },
  husary: { read: 118, folder: "https://cdn.mp3quran.net/audio/mahmoud-husary/r1/" },
  "husary-mujawwad": { read: 119, folder: "https://cdn.mp3quran.net/audio/mahmoud-husary/r2/" },
  abdulbasit: { read: 53, folder: "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r3/" },
  "abdulbasit-mujawwad": { read: 51, folder: "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r1/" },
  sudais: { read: 54, folder: "https://cdn.mp3quran.net/audio/abdulrahman-sudais/r1/" },
  shuraim: { read: 31, folder: "https://cdn.mp3quran.net/audio/saud-shuraim/r1/" },
  ghamdi: { read: 30, folder: "https://cdn.mp3quran.net/audio/saad-ghamdi/r1/" },
  dossari: { read: 92, folder: "https://cdn.mp3quran.net/audio/yasser-dosari/r1/" },
  hudhaifi: { read: 74, folder: "https://cdn.mp3quran.net/audio/ali-hudhaifi/r1/" },
  ayyoub: { read: 109, folder: "https://cdn.mp3quran.net/audio/muhammad-ayyub/r1/" },
  ajamy: { read: 5, folder: "https://cdn.mp3quran.net/audio/ahmad-ajmi/r1/" },
  basfar: { read: 60, folder: "https://cdn.mp3quran.net/audio/abdullah-basfar/r1/" },
  rifai: { read: 89, folder: "https://cdn.mp3quran.net/audio/hani-rifai/r1/" },
  qahtani: { read: 21, folder: "https://cdn.mp3quran.net/audio/khalid-qahtani/r1/" },
  bukhatir: { read: 46, folder: "https://cdn.mp3quran.net/audio/salah-bukhatir/r1/" },
};

export function hasSurahAudio(reciterId: string): boolean {
  return reciterId in SURAH_AUDIO;
}

export function surahAudioUrl(reciterId: string, surah: number): string | null {
  const s = SURAH_AUDIO[reciterId];
  return s ? `${s.folder}${String(surah).padStart(3, "0")}.mp3` : null;
}

/** One surah's file and where each ayah is in it (seconds). `ayahs[k]` is ayah k+1. */
export interface SurahTiming {
  url: string;
  ayahs: { start: number; end: number }[];
}

/**
 * Checks and converts mp3quran's timing list (ms) for one surah. Null when it does not cover every ayah once, in
 * order, with times that go forward: then the ayah-by-ayah files are used instead.
 */
export function parseTimings(raw: unknown, ayahCount: number, url: string): SurahTiming | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw.filter((r) => r && typeof r === "object" && Number((r as { ayah: unknown }).ayah) >= 1) as {
    ayah: unknown;
    start_time: unknown;
    end_time: unknown;
  }[];
  if (rows.length !== ayahCount) return null;
  const ayahs: SurahTiming["ayahs"] = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    const start = Number(r.start_time);
    const end = Number(r.end_time);
    if (Number(r.ayah) !== k + 1 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) return null;
    if (k > 0 && start < ayahs[k - 1].start * 1000) return null;
    ayahs.push({ start: start / 1000, end: end / 1000 });
  }
  return { url, ayahs };
}

/** Where to start an ayah in its surah file: ayah 1 starts at the very beginning (with the basmala, as recited). */
export function ayahStart(t: SurahTiming, ayah: number): number {
  return ayah <= 1 ? 0 : t.ayahs[ayah - 1].start;
}
