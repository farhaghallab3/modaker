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
  /** The letter the mistake sits on (one Uthmani letter, "" when unknown). */
  letter: string;
  /** A few phonemes: what the correct reading has here, and what was heard (phonetic script, "" when unknown). */
  expected: string;
  heard: string;
}

/** A tajweed rule in a word that was heard and got no note: something the reader did well. */
export interface TajweedGood {
  ayah: number;
  word: number;
  wordsInAyah: number;
  rule: TajweedRuleKey;
}

export interface TajweedResult {
  notes: TajweedNote[];
  /** What was read well (for the teacher's praise). */
  good: TajweedGood[];
  /** Ayahs the checker heard at least part of (even when the word check missed them). */
  heardAyahs: number[];
  /** Pieces of the recording the checker could place inside the requested ayahs. 0 → nothing was judged. */
  matched: number;
  /** Signed sentences for the teacher's voice, one per spoken note (see tajweedSpeech). Absent or null: no voice. */
  speech?: { text: string; exp: number; sig: string }[] | null;
}

const KINDS = new Set<TajweedKind>(["letters", "harakat", "tajweed"]);
const OPS = new Set<TajweedOp>(["insert", "delete", "replace", "missing"]);
const intOrNull = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 20 ? (v as number) : undefined);

/** A short string of Arabic letters and marks only (anything else → ""). */
const arabicBit = (v: unknown, max: number) => (typeof v === "string" && v.length <= max && /^[\u0600-\u06FF]*$/u.test(v) ? v : "");

/** Keeps only well-formed notes inside the requested ayahs (the checker is an outside service). */
export function parseTajweedResult(raw: unknown, range: { from: number; to: number }, max = 12): TajweedResult {
  const r = (raw ?? {}) as { notes?: unknown; matched?: unknown; good?: unknown; heardAyahs?: unknown };
  const inRange = (a: unknown): a is number => Number.isInteger(a) && (a as number) >= range.from && (a as number) <= range.to;
  const good: TajweedGood[] = [];
  for (const g of Array.isArray(r.good) ? r.good.slice(0, 6) : []) {
    const x = g as Record<string, unknown>;
    const word = x.word, words = x.wordsInAyah;
    if (!inRange(x.ayah) || !Number.isInteger(word) || !Number.isInteger(words) || (word as number) < 0 || (word as number) >= (words as number) || (words as number) > 200) continue;
    if (typeof x.rule !== "string" || !Object.hasOwn(TAJWEED_RULES, x.rule)) continue;
    good.push({ ayah: x.ayah, word: word as number, wordsInAyah: words as number, rule: x.rule as TajweedRuleKey });
  }
  const heardAyahs = [...new Set(Array.isArray(r.heardAyahs) ? r.heardAyahs.filter(inRange) : [])].sort((a, b) => a - b);
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
    notes.push({
      ayah: ayah as number,
      word: word as number,
      wordsInAyah: words as number,
      kind: x.kind as TajweedKind,
      op: x.op as TajweedOp,
      rule,
      expectedLen,
      heardLen,
      letter: arabicBit(x.letter, 1),
      expected: arabicBit(x.expected, 8),
      heard: arabicBit(x.heard, 8),
    });
    if (notes.length >= max) break;
  }
  notes.sort((a, b) => a.ayah - b.ayah || a.word - b.word);
  const matched = Number.isInteger(r.matched) && (r.matched as number) >= 0 ? (r.matched as number) : 0;
  return { notes, matched, good, heardAyahs };
}

function counts(n: number): string {
  if (n === 1) return "حركة واحدة";
  if (n === 2) return "حركتين";
  return `${toArabicDigits(n)} حركات`;
}

// ── specific reasons ─────────────────────────────────────────────────────────

const FATHA = "\u064E", DAMMA = "\u064F", KASRA = "\u0650";
const QALQALA = "\u0687";
/** The madd letters of the phonetic script (alif, small waw, small yaa). */
const MADD = new Set(["\u0627", "\u06E5", "\u06E6"]);

/** Arabic names of letters, in Uthmani script and in the checker's phonetic script. */
const LETTER_NAMES: Record<string, string> = {
  "ء": "الهمزة", "أ": "الهمزة", "إ": "الهمزة", "ؤ": "الهمزة", "ئ": "الهمزة", "آ": "الهمزة", "\u0672": "الهمزة المسهّلة",
  "ٱ": "همزة الوصل", "ا": "الألف", "ب": "الباء", "ت": "التاء", "ة": "التاء المربوطة", "ث": "الثاء", "ج": "الجيم", "ح": "الحاء",
  "خ": "الخاء", "د": "الدال", "ذ": "الذال", "ر": "الراء", "ز": "الزاي", "س": "السين", "ش": "الشين", "ص": "الصاد",
  "ض": "الضاد", "ط": "الطاء", "ظ": "الظاء", "ع": "العين", "غ": "الغين", "ف": "الفاء", "ق": "القاف", "ك": "الكاف",
  "ل": "اللام", "م": "الميم", "ن": "النون", "ه": "الهاء", "و": "الواو", "ي": "الياء", "ى": "الألف المقصورة",
  "\u06E5": "واو المدّ", "\u06E6": "ياء المدّ", "\u06BA": "النون المخفاة", "\u06FE": "الميم المخفاة",
};

const VOWEL: Record<string, { adj: string; noun: string }> = {
  [FATHA]: { adj: "مفتوحًا", noun: "الفتح" },
  [DAMMA]: { adj: "مضمومًا", noun: "الضم" },
  [KASRA]: { adj: "مكسورًا", noun: "الكسر" },
};

interface Sound {
  letter: string;
  vowel: string; // one of FATHA/DAMMA/KASRA, or "" (sakin)
  doubled: boolean; // shadda
}

/** Phonetic script → letters with their vowel ("بب" + kasra = a doubled baa with kasra). */
export function parseSounds(ph: string): Sound[] {
  const out: Sound[] = [];
  for (const ch of ph) {
    if (ch === FATHA || ch === DAMMA || ch === KASRA) {
      if (out.length) out[out.length - 1].vowel = ch;
    } else if (ch === QALQALA || !/\p{L}/u.test(ch)) {
      continue;
    } else {
      const last = out[out.length - 1];
      if (last && last.letter === ch && !last.vowel && !MADD.has(ch)) last.doubled = true;
      else if (last && last.letter === ch && MADD.has(ch)) continue; // a longer madd, not a new letter
      else out.push({ letter: ch, vowel: "", doubled: false });
    }
  }
  return out;
}

const letterName = (ch: string) => LETTER_NAMES[ch] ?? null;
/** The letter as shown on screen with its vowel, e.g. «دُ». Only a letter, never a word. */
const shown = (s: Sound) => `«${s.letter}${s.doubled ? "\u0651" : ""}${s.vowel}»`;
const vowelAdj = (v: string) => VOWEL[v]?.adj ?? "ساكنًا";

/** A reason, in two forms: for the screen (may show the single letter with its vowel) and for the teacher's voice. */
export interface NoteReason {
  text: string;
  speech: string;
}

function harakatReason(n: TajweedNote): NoteReason | null {
  const exp = parseSounds(n.expected).filter((s) => !MADD.has(s.letter));
  const got = parseSounds(n.heard).filter((s) => !MADD.has(s.letter));
  const e = exp[0];
  if (!e) return null;
  const g = got.find((s) => s.letter === e.letter) ?? got[0];
  const name = letterName(e.letter) ?? (n.letter ? letterName(n.letter) : null);
  if (!name) return null;
  if (e.doubled && g && !g.doubled && g.vowel === e.vowel) {
    return { text: `حرف ${name} هنا مشدّد ${shown(e)}، وسمعته بلا شدّة. اضغط عليه.`, speech: `حرف ${name} هنا مشدّد، وسمعته بلا شدّة. اضغط عليه قليلًا.` };
  }
  const heardVowel = g ? g.vowel : "";
  if (heardVowel === e.vowel) return null;
  const want = e.vowel ? `حقّه ${VOWEL[e.vowel].noun}` : "حقّه السكون";
  const heard = g ? `وسمعته ${vowelAdj(heardVowel)}` : "ولم أسمعه";
  const tip = e.vowel ? `أعطِه ${VOWEL[e.vowel].noun} واضحًا.` : "سكِّنه.";
  return {
    text: `حرف ${name} ${want} ${shown(e)}، ${heard}${g ? ` ${shown(g)}` : ""}. ${tip}`,
    speech: `حرف ${name} هنا ${want}، ${heard}. ${tip}`,
  };
}

function lettersReason(n: TajweedNote): NoteReason | null {
  const e = parseSounds(n.expected)[0];
  const g = parseSounds(n.heard)[0];
  const eName = e ? letterName(e.letter) : n.letter ? letterName(n.letter) : null;
  const gName = g ? letterName(g.letter) : null;
  if (n.op === "delete" && eName) {
    const s = `سقط منك حرف ${eName} في هذه الكلمة. انطقه ولا تتجاوزه.`;
    return { text: s, speech: s };
  }
  if (n.op === "insert" && gName) {
    const s = `سمعت زيادة: حرف ${gName}، وليس هنا. اقرأ الكلمة كما هي دون زيادة.`;
    return { text: s, speech: s };
  }
  if (e && g && eName && gName && e.letter !== g.letter) {
    return {
      text: `هنا حرف ${eName} «${e.letter}»، وسمعت مكانه حرف ${gName} «${g.letter}». أخرِجه من مخرجه الصحيح.`,
      speech: `هنا حرف ${eName}، وسمعت مكانه حرف ${gName}. أخرِجه من مخرجه الصحيح.`,
    };
  }
  return null;
}

function ruleReason(n: TajweedNote): NoteReason {
  const name = n.rule ? TAJWEED_RULES[n.rule] : "التجويد";
  const on = n.letter && letterName(n.letter) ? ` في حرف ${letterName(n.letter)}` : "";
  let s: string;
  if (n.rule === "qalqalah") s = `${name}: أظهِر القلقلة${on}، حرّك صوته قليلًا عند السكون.`;
  else if (n.rule === "idgham") s = `${name}: أدغِم الحرف في الذي بعده ولا تُظهره.`;
  else if (n.rule === "ghunnah") s = `${name}${on}: أظهِر الغنّة من الأنف بمقدار حركتين.`;
  else if (n.op === "delete" || n.heardLen === 0) s = `${name}: لم يظهر المدّ هنا. مُدّ الصوت.`;
  else if (n.expectedLen && n.heardLen !== null) {
    const base = `${name}: يُمدّ ${counts(n.expectedLen)}، وسمعته نحو ${counts(n.heardLen)}.`;
    s = n.heardLen < n.expectedLen ? `${base} أطِل المدّ.` : `${base} لا تُطِل أكثر من اللازم.`;
  } else s = `${name}: راجع هذا الحكم مع الشيخ.`;
  return { text: s, speech: s };
}

/** Why this word got a note, as specifically as the checker allows (which letter, which vowel, which rule). */
export function tajweedReason(n: TajweedNote): NoteReason {
  if (n.kind === "tajweed") return ruleReason(n);
  const specific = n.kind === "harakat" ? harakatReason(n) : lettersReason(n);
  if (specific) return specific;
  // The checker did not say enough: a general but still useful hint.
  const s =
    n.kind === "harakat"
      ? "حركة في هذه الكلمة لم تُقرأ كما ينبغي. استمع إلى الشيخ فيها وقلّده."
      : n.op === "delete"
        ? "سقط منك حرف في هذه الكلمة. انطقها كاملة."
        : n.op === "insert"
          ? "زِدتَ صوتًا ليس في هذه الكلمة."
          : "نطقتَ حرفًا فيها بغير مخرجه الصحيح. استمع إلى الشيخ وقلّده.";
  return { text: s, speech: s };
}

/** The teacher's sentence for one note (shown under the word). */
export function tajweedNoteText(n: TajweedNote): string {
  return tajweedReason(n).text;
}

const ORDINALS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];

/** «الآية الثانية، الكلمة الأولى»: where the note is, in words the voice can say (never the Quran word itself). */
export function notePlace(n: TajweedNote): string {
  const ayah = n.ayah <= 10 ? `الآية ${ORDINALS[n.ayah - 1]}` : `الآية رقم ${n.ayah}`;
  const word =
    n.wordsInAyah > 1 && n.word === n.wordsInAyah - 1
      ? "الكلمة الأخيرة"
      : n.word < 10
        ? `الكلمة ${ORDINALS[n.word]}`
        : `الكلمة رقم ${n.word + 1}`;
  return `${ayah}، ${word}`;
}

/** How many notes the teacher says out loud (the rest stay written). */
export const SPOKEN_NOTES = 3;

/** What the teacher says about each of the first notes, in order, like a sheikh going through them. */
export function tajweedSpeech(notes: TajweedNote[]): string[] {
  const said = notes.slice(0, SPOKEN_NOTES);
  return said.map((n, i) => {
    const lead = said.length === 1 ? "" : i === 0 ? "أولًا، " : i === said.length - 1 ? "وأخيرًا، " : "وبعدها، ";
    const more = i === said.length - 1 && notes.length > said.length ? " وبقية الملاحظات مكتوبة لك تحت." : "";
    return `${lead}في ${notePlace(n)}: ${tajweedReason(n).speech}${more}`;
  });
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
