/**
 * Surah metadata (Hafs ʿan ʿĀṣim, 6236 ayahs; Makki/Madani per the Tanzil
 * metadata classification). This is *metadata only* — no Quran text lives in
 * the source tree. Verse text is always loaded from a verified source through
 * `QuranProvider` (see src/server/quran). `scripts/import-quran.ts` re-checks
 * these counts against the imported text and refuses to import on mismatch.
 */
import type { SurahMeta } from "@/lib/types";

type Row = [number, string, string, number, "meccan" | "medinan"];

const ROWS: Row[] = [
  [1, "الفاتحة", "Al-Fatihah", 7, "meccan"],
  [2, "البقرة", "Al-Baqarah", 286, "medinan"],
  [3, "آل عمران", "Aal-Imran", 200, "medinan"],
  [4, "النساء", "An-Nisa", 176, "medinan"],
  [5, "المائدة", "Al-Ma'idah", 120, "medinan"],
  [6, "الأنعام", "Al-An'am", 165, "meccan"],
  [7, "الأعراف", "Al-A'raf", 206, "meccan"],
  [8, "الأنفال", "Al-Anfal", 75, "medinan"],
  [9, "التوبة", "At-Tawbah", 129, "medinan"],
  [10, "يونس", "Yunus", 109, "meccan"],
  [11, "هود", "Hud", 123, "meccan"],
  [12, "يوسف", "Yusuf", 111, "meccan"],
  [13, "الرعد", "Ar-Ra'd", 43, "medinan"],
  [14, "إبراهيم", "Ibrahim", 52, "meccan"],
  [15, "الحجر", "Al-Hijr", 99, "meccan"],
  [16, "النحل", "An-Nahl", 128, "meccan"],
  [17, "الإسراء", "Al-Isra", 111, "meccan"],
  [18, "الكهف", "Al-Kahf", 110, "meccan"],
  [19, "مريم", "Maryam", 98, "meccan"],
  [20, "طه", "Taha", 135, "meccan"],
  [21, "الأنبياء", "Al-Anbiya", 112, "meccan"],
  [22, "الحج", "Al-Hajj", 78, "medinan"],
  [23, "المؤمنون", "Al-Mu'minun", 118, "meccan"],
  [24, "النور", "An-Nur", 64, "medinan"],
  [25, "الفرقان", "Al-Furqan", 77, "meccan"],
  [26, "الشعراء", "Ash-Shu'ara", 227, "meccan"],
  [27, "النمل", "An-Naml", 93, "meccan"],
  [28, "القصص", "Al-Qasas", 88, "meccan"],
  [29, "العنكبوت", "Al-Ankabut", 69, "meccan"],
  [30, "الروم", "Ar-Rum", 60, "meccan"],
  [31, "لقمان", "Luqman", 34, "meccan"],
  [32, "السجدة", "As-Sajdah", 30, "meccan"],
  [33, "الأحزاب", "Al-Ahzab", 73, "medinan"],
  [34, "سبأ", "Saba", 54, "meccan"],
  [35, "فاطر", "Fatir", 45, "meccan"],
  [36, "يس", "Ya-Sin", 83, "meccan"],
  [37, "الصافات", "As-Saffat", 182, "meccan"],
  [38, "ص", "Sad", 88, "meccan"],
  [39, "الزمر", "Az-Zumar", 75, "meccan"],
  [40, "غافر", "Ghafir", 85, "meccan"],
  [41, "فصلت", "Fussilat", 54, "meccan"],
  [42, "الشورى", "Ash-Shura", 53, "meccan"],
  [43, "الزخرف", "Az-Zukhruf", 89, "meccan"],
  [44, "الدخان", "Ad-Dukhan", 59, "meccan"],
  [45, "الجاثية", "Al-Jathiyah", 37, "meccan"],
  [46, "الأحقاف", "Al-Ahqaf", 35, "meccan"],
  [47, "محمد", "Muhammad", 38, "medinan"],
  [48, "الفتح", "Al-Fath", 29, "medinan"],
  [49, "الحجرات", "Al-Hujurat", 18, "medinan"],
  [50, "ق", "Qaf", 45, "meccan"],
  [51, "الذاريات", "Adh-Dhariyat", 60, "meccan"],
  [52, "الطور", "At-Tur", 49, "meccan"],
  [53, "النجم", "An-Najm", 62, "meccan"],
  [54, "القمر", "Al-Qamar", 55, "meccan"],
  [55, "الرحمن", "Ar-Rahman", 78, "medinan"],
  [56, "الواقعة", "Al-Waqi'ah", 96, "meccan"],
  [57, "الحديد", "Al-Hadid", 29, "medinan"],
  [58, "المجادلة", "Al-Mujadilah", 22, "medinan"],
  [59, "الحشر", "Al-Hashr", 24, "medinan"],
  [60, "الممتحنة", "Al-Mumtahanah", 13, "medinan"],
  [61, "الصف", "As-Saff", 14, "medinan"],
  [62, "الجمعة", "Al-Jumu'ah", 11, "medinan"],
  [63, "المنافقون", "Al-Munafiqun", 11, "medinan"],
  [64, "التغابن", "At-Taghabun", 18, "medinan"],
  [65, "الطلاق", "At-Talaq", 12, "medinan"],
  [66, "التحريم", "At-Tahrim", 12, "medinan"],
  [67, "الملك", "Al-Mulk", 30, "meccan"],
  [68, "القلم", "Al-Qalam", 52, "meccan"],
  [69, "الحاقة", "Al-Haqqah", 52, "meccan"],
  [70, "المعارج", "Al-Ma'arij", 44, "meccan"],
  [71, "نوح", "Nuh", 28, "meccan"],
  [72, "الجن", "Al-Jinn", 28, "meccan"],
  [73, "المزمل", "Al-Muzzammil", 20, "meccan"],
  [74, "المدثر", "Al-Muddaththir", 56, "meccan"],
  [75, "القيامة", "Al-Qiyamah", 40, "meccan"],
  [76, "الإنسان", "Al-Insan", 31, "medinan"],
  [77, "المرسلات", "Al-Mursalat", 50, "meccan"],
  [78, "النبأ", "An-Naba", 40, "meccan"],
  [79, "النازعات", "An-Nazi'at", 46, "meccan"],
  [80, "عبس", "Abasa", 42, "meccan"],
  [81, "التكوير", "At-Takwir", 29, "meccan"],
  [82, "الانفطار", "Al-Infitar", 19, "meccan"],
  [83, "المطففين", "Al-Mutaffifin", 36, "meccan"],
  [84, "الانشقاق", "Al-Inshiqaq", 25, "meccan"],
  [85, "البروج", "Al-Buruj", 22, "meccan"],
  [86, "الطارق", "At-Tariq", 17, "meccan"],
  [87, "الأعلى", "Al-A'la", 19, "meccan"],
  [88, "الغاشية", "Al-Ghashiyah", 26, "meccan"],
  [89, "الفجر", "Al-Fajr", 30, "meccan"],
  [90, "البلد", "Al-Balad", 20, "meccan"],
  [91, "الشمس", "Ash-Shams", 15, "meccan"],
  [92, "الليل", "Al-Layl", 21, "meccan"],
  [93, "الضحى", "Ad-Duha", 11, "meccan"],
  [94, "الشرح", "Ash-Sharh", 8, "meccan"],
  [95, "التين", "At-Tin", 8, "meccan"],
  [96, "العلق", "Al-Alaq", 19, "meccan"],
  [97, "القدر", "Al-Qadr", 5, "meccan"],
  [98, "البينة", "Al-Bayyinah", 8, "medinan"],
  [99, "الزلزلة", "Az-Zalzalah", 8, "medinan"],
  [100, "العاديات", "Al-Adiyat", 11, "meccan"],
  [101, "القارعة", "Al-Qari'ah", 11, "meccan"],
  [102, "التكاثر", "At-Takathur", 8, "meccan"],
  [103, "العصر", "Al-Asr", 3, "meccan"],
  [104, "الهمزة", "Al-Humazah", 9, "meccan"],
  [105, "الفيل", "Al-Fil", 5, "meccan"],
  [106, "قريش", "Quraysh", 4, "meccan"],
  [107, "الماعون", "Al-Ma'un", 7, "meccan"],
  [108, "الكوثر", "Al-Kawthar", 3, "meccan"],
  [109, "الكافرون", "Al-Kafirun", 6, "meccan"],
  [110, "النصر", "An-Nasr", 3, "medinan"],
  [111, "المسد", "Al-Masad", 5, "meccan"],
  [112, "الإخلاص", "Al-Ikhlas", 4, "meccan"],
  [113, "الفلق", "Al-Falaq", 5, "meccan"],
  [114, "الناس", "An-Nas", 6, "meccan"],
];

export const SURAHS: SurahMeta[] = ROWS.map(([number, nameAr, nameEn, ayahCount, revelation]) => ({
  number,
  nameAr,
  nameEn,
  ayahCount,
  revelation,
}));

export const TOTAL_AYAHS = 6236;

export function getSurahMeta(n: number): SurahMeta | undefined {
  return SURAHS[n - 1];
}

export function revelationLabel(r: SurahMeta["revelation"]) {
  return r === "meccan" ? "مكية" : "مدنية";
}

/** Convert Latin digits to Arabic-Indic digits for display. */
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** Global ayah index (1..6236), used by audio CDNs and the DB. */
export function globalAyahIndex(surah: number, ayah: number): number {
  let idx = 0;
  for (let i = 0; i < surah - 1; i++) idx += ROWS[i][3];
  return idx + ayah;
}

/** "019032" — the key format used by EveryAyah audio files. */
export function ayahAudioKey(surah: number, ayah: number): string {
  return `${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}`;
}
