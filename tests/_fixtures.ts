/**
 * Shared test fixtures. NO Quran text appears anywhere in this repository: the "verses" below are
 * deterministic sentences made of ordinary Arabic words. Surah names and ayah counts are real
 * metadata only.
 */
import { getSurahMeta } from "../src/lib/quran/surahs";
import type { Ayah, SurahText, TafsirEntry } from "../src/lib/types";
import { QuranSourceUnavailableError } from "../src/server/errors";
import type { QuranProvider } from "../src/server/quran/common";

const WORDS = [
  "الطالب", "المدرسة", "الكتاب", "المكتبة", "الحديقة", "الشجرة", "البحر", "الجبل", "النهر", "القمر", "السماء", "الأرض", "الصباح", "المساء",
  "الطريق", "البيت", "النافذة", "الباب", "الوردة", "الغيمة", "المطر", "الريح", "الطائر", "السفينة", "الميناء", "التاجر", "السوق", "الخباز",
  "الفرن", "الخبز", "العامل", "المصنع", "الآلة", "المعلم", "الدرس", "الورقة", "القلم", "الحبر", "الصديق", "الجار", "الضيف", "المائدة", "الطعام",
  "الماء", "الشاي", "القهوة", "الحليب", "العسل", "الثمرة", "البستان", "الفلاح", "الحقل", "الحصاد", "القطار", "المحطة", "الرحلة", "الجسر",
  "المدينة", "القرية", "الساعة", "كبير", "جميل", "هادئ", "قديم", "جديد", "سريع", "بطيء", "واسع", "ضيق", "عالي", "بعيد", "قريب", "نظيف",
];

function lcg(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** Deterministic, distinct, non-scriptural sentence for a position. */
export function fakeAyahText(surah: number, ayah: number): string {
  const r = lcg(surah * 1009 + ayah * 31 + 7);
  const n = 6 + Math.floor(r() * 3);
  const picked: string[] = [];
  while (picked.length < n) {
    const w = WORDS[Math.floor(r() * WORDS.length)];
    if (!picked.includes(w)) picked.push(w);
  }
  return picked.join(" ");
}

export function fakeSurah(n: number): SurahText {
  const meta = getSurahMeta(n)!;
  const ayahs: Ayah[] = Array.from({ length: meta.ayahCount }, (_, i) => ({
    surah: n,
    ayah: i + 1,
    key: `${n}:${i + 1}`,
    textUthmani: fakeAyahText(n, i + 1),
  }));
  return { meta, ayahs, source: { id: "test:quran", title: "مصدر اختبار", publisher: "اختبار" } };
}

export function corpus(surahs: number[]): Ayah[] {
  return surahs.flatMap((n) => fakeSurah(n).ayahs);
}

export class FakeQuran implements QuranProvider {
  readonly id = "fake";
  calls = 0;
  constructor(private down = false) {}
  async getSurah(n: number) {
    this.calls++;
    if (this.down) throw new QuranSourceUnavailableError("down");
    return fakeSurah(n);
  }
  async getAyahs(r: { surah: number; from: number; to: number }) {
    return (await this.getSurah(r.surah)).ayahs.slice(r.from - 1, r.to);
  }
  async getTafsir(n: number): Promise<TafsirEntry[]> {
    if (this.down) throw new QuranSourceUnavailableError("down");
    return fakeSurah(n).ayahs.map((a) => ({
      key: a.key,
      text: `شرح تجريبي للموضع ${a.ayah}: يتحدث عن ${a.ayah % 2 ? "الصبر والثبات" : "العمل والاجتهاد"} في طلب العلم.`,
      source: { id: "tafsir:muyassar", title: "التفسير الميسر" },
    }));
  }
}
