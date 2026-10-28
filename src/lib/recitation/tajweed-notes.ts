/**
 * Tajweed notes: what the free tajweed checker (services/tajweed, Quran Muaalem model) found, per word.
 * Pure and shared by the server (validation) and the screen (text). The Arabic sentences are written here,
 * never by the model, and never contain Quran words: the screen shows the word from Modaker's own verified text.
 */
import { toArabicDigits } from "@/lib/quran/surahs";

export const TAJWEED_RULES = {
  madd_tabii: "المدّ الطبيعي",
  madd_monfasel: "المدّ المنفصل",
  madd_mottasel: "المدّ المتّصل",
  madd_lazem: "المدّ اللازم",
  madd_aared: "المدّ العارض للسكون",
  madd_leen: "مدّ اللين",
  ghunnah: "الغنّة",
  qalqalah: "القلقلة",
  idgham: "الإدغام",
} as const;

export type TajweedRuleKey = keyof typeof TAJWEED_RULES;
export type TajweedKind = "letters" | "harakat" | "tajweed";
export type TajweedOp = "insert" | "delete" | "replace" | "missing";

export interface TajweedNote {
  ayah: number;
  /** 0-based word index inside the ayah (in the checker's Uthmani text). */
  word: number;
  /** How many words the checker counts in that ayah: the word is shown only when Modaker's text agrees. */
  wordsInAyah: number;
  kind: TajweedKind;
  op: TajweedOp;
  rule: TajweedRuleKey | null;
  expectedLen: number | null;
  heardLen: number | null;
}

export interface TajweedResult {
  notes: TajweedNote[];
  /** Pieces of the recording the checker could place inside the requested ayahs. 0 → nothing was judged. */
  matched: number;
}

const KINDS = new Set<TajweedKind>(["letters", "harakat", "tajweed"]);
const OPS = new Set<TajweedOp>(["insert", "delete", "replace", "missing"]);
const intOrNull = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 20 ? (v as number) : undefined);

/** Keeps only well-formed notes inside the requested ayahs (the checker is an outside service). */
export function parseTajweedResult(raw: unknown, range: { from: number; to: number }, max = 12): TajweedResult {
  const r = (raw ?? {}) as { notes?: unknown; matched?: unknown };
  const notes: TajweedNote[] = [];
  for (const n of Array.isArray(r.notes) ? r.notes : []) {
    const x = n as Record<string, unknown>;
    const ayah = x.ayah, word = x.word, words = x.wordsInAyah;
    if (!Number.isInteger(ayah) || (ayah as number) < range.from || (ayah as number) > range.to) continue;
    if (!Number.isInteger(word) || !Number.isInteger(words) || (word as number) < 0 || (word as number) >= (words as number) || (words as number) > 200) continue;
    if (!KINDS.has(x.kind as TajweedKind) || !OPS.has(x.op as TajweedOp)) continue;
    const rule = x.rule === null || x.rule === undefined ? null : typeof x.rule === "string" && Object.hasOwn(TAJWEED_RULES, x.rule) ? (x.rule as TajweedRuleKey) : undefined;
    if (rule === undefined || (x.kind === "tajweed" && rule === null)) continue;
    const expectedLen = intOrNull(x.expectedLen), heardLen = intOrNull(x.heardLen);
    if (expectedLen === undefined || heardLen === undefined) continue;
    notes.push({ ayah: ayah as number, word: word as number, wordsInAyah: words as number, kind: x.kind as TajweedKind, op: x.op as TajweedOp, rule, expectedLen, heardLen });
    if (notes.length >= max) break;
  }
  notes.sort((a, b) => a.ayah - b.ayah || a.word - b.word);
  const matched = Number.isInteger(r.matched) && (r.matched as number) >= 0 ? (r.matched as number) : 0;
  return { notes, matched };
}

function counts(n: number): string {
  if (n === 1) return "حركة واحدة";
  if (n === 2) return "حركتين";
  return `${toArabicDigits(n)} حركات`;
}

/** The teacher's sentence for one note (shown under the word). */
export function tajweedNoteText(n: TajweedNote): string {
  if (n.kind === "letters") {
    if (n.op === "delete") return "سقط منك حرف أو أكثر في هذه الكلمة. انطقها كاملة.";
    if (n.op === "insert") return "زِدتَ صوتًا ليس في هذه الكلمة.";
    return "نطقتَ حرفًا فيها بغير مخرجه الصحيح. استمع إلى الشيخ وقلّده.";
  }
  if (n.kind === "harakat") return "انتبه لحركات هذه الكلمة (الفتحة والضمة والكسرة والسكون).";

  const name = n.rule ? TAJWEED_RULES[n.rule] : "التجويد";
  if (n.rule === "qalqalah") return `${name}: أظهِر القلقلة في الحرف الساكن.`;
  if (n.rule === "idgham") return `${name}: أدغِم الحرف في الذي بعده.`;
  if (n.rule === "ghunnah") return `${name}: أظهِر الغنّة بمقدار حركتين.`;
  // Madd
  if (n.op === "delete" || n.heardLen === 0) return `${name}: لم يظهر المدّ هنا.`;
  if (n.expectedLen && n.heardLen !== null) {
    const base = `${name}: يُمدّ ${counts(n.expectedLen)}، وسمعته نحو ${counts(n.heardLen)}.`;
    return n.heardLen < n.expectedLen ? `${base} أطِل المدّ.` : `${base} لا تُطِل أكثر من اللازم.`;
  }
  return `${name}: راجع هذا الحكم مع الشيخ.`;
}

export const TAJWEED_KIND_LABEL: Record<TajweedKind, string> = {
  letters: "الحروف",
  harakat: "الحركات",
  tajweed: "التجويد",
};

/** The word to show for a note, from Modaker's verified text, only when both texts count the same words. */
export function noteWord(n: TajweedNote, ayahText: string | undefined): string | null {
  if (!ayahText) return null;
  const words = ayahText.trim().split(/\s+/);
  return words.length === n.wordsInAyah ? (words[n.word] ?? null) : null;
}
