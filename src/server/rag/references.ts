/**
 * Extract Quran references from an Arabic question (pure — no I/O, safe to
 * unit-test). Understands:
 *   - surah names (all 114 + common alternates), with/without "سورة",
 *     hamza/alef/ta-marbuta spelling variants, "ال" present or dropped after
 *     "سورة", attached clitics (و/ف/ب/ل) — e.g. "الملك", "سورة الملك", "سورة ملك", "بسورة يوسف"
 *   - ayah numbers: "الآية 32", "آية ٣٢", "الآيات 1-5", "الآيات من 1 إلى 5",
 *     "الآية الأولى", "مريم 32", "19:32", "19:32-35"
 *   - UI context ({ surah, ayah, storySlug }) when the question has no explicit refs
 *
 * Common-word names (e.g. "الناس", "النور", "الطلاق") only count when written
 * as "سورة …" or followed by an ayah number, to avoid false positives.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import { SURAHS, getSurahMeta } from "@/lib/quran/surahs";
import type { AyahRange } from "@/lib/types";

export interface ReferenceContext {
  surah?: number;
  ayah?: number;
  storySlug?: string;
}

export interface ParsedReferences {
  /** Surahs in order of first mention (deduped). */
  surahs: number[];
  /** Specific, validated ayah ranges. */
  ranges: AyahRange[];
  storySlug?: string;
  /** True when the refs were taken from the UI context, not the question text. */
  fromContext: boolean;
}

// ── Name tables ──────────────────────────────────────────────────────────

/** Alternate names in common use → surah number. */
const ALIASES: [string, number][] = [
  ["براءة", 9],
  ["بني إسرائيل", 17],
  ["المؤمن", 40],
  ["حم السجدة", 41],
  ["القتال", 47],
  ["تبارك", 67],
  ["الدهر", 76],
  ["عم", 78],
  ["تبت", 111],
  ["اللهب", 111],
  ["التوحيد", 112],
];

/**
 * Names that are also everyday words: require "سورة" or a following number.
 * Stored normalized (see normalizeArabic).
 */
const AMBIGUOUS = new Set(
  [
    "ص", "ق", "عم", "الناس", "الإنسان", "النساء", "محمد", "الليل", "الشمس", "القمر", "النجم", "الفجر",
    "العصر", "الضحى", "النور", "الفتح", "الحج", "الحديد", "الدخان", "المؤمن", "المؤمنون", "التوبة",
    "الطلاق", "التحريم", "النصر", "البلد", "الجمعة", "القيامة", "النبأ", "القدر", "الكافرون",
    "المنافقون", "الجن", "الأنبياء", "الحشر", "الطور", "سبأ", "قريش", "الشورى", "الرعد", "الحجر",
    "الصف", "الواقعة", "التين", "العلق", "القلم", "الشعراء", "التوحيد", "القتال", "الدهر", "براءة",
    "الروم", "المعارج", "الحاقة", "الزلزلة", "الفلق", "التغابن", "الأحزاب", "الماعون", "تبت",
  ].map(normalizeArabic),
);

interface NameEntry {
  tokens: string[];
  surah: number;
  /** only valid right after "سورة" (e.g. the name with "ال" dropped) */
  strongOnly: boolean;
  ambiguous: boolean;
}

function buildNameTable(): NameEntry[] {
  const out: NameEntry[] = [];
  const add = (raw: string, surah: number) => {
    const norm = normalizeArabic(raw);
    const tokens = norm.split(" ");
    const ambiguous = AMBIGUOUS.has(norm) || norm.length === 1;
    out.push({ tokens, surah, strongOnly: false, ambiguous });
    // "سورة ملك" / "سورة كهف": the definite article dropped after "سورة".
    if (tokens.length === 1 && norm.startsWith("ال") && norm.length > 3) {
      out.push({ tokens: [norm.slice(2)], surah, strongOnly: true, ambiguous: true });
    }
  };
  for (const s of SURAHS) add(s.nameAr, s.number);
  for (const [name, n] of ALIASES) add(name, n);
  // Longest names first so "حم السجدة" beats "السجدة".
  return out.sort((a, b) => b.tokens.length - a.tokens.length);
}

const NAMES = buildNameTable();

const SURAH_WORDS = new Set(["سوره", "السوره"]);
const AYAH_WORDS = new Set(["ايه", "الايه", "ايات", "الايات", "الايتين", "ايتين"]);
const RANGE_JOINERS = new Set(["الي", "حتي", "و", "-"]);
const ORDINALS: Record<string, number> = {
  الاولي: 1, الاول: 1, الثانيه: 2, الثاني: 2, الثالثه: 3, الثالث: 3, الرابعه: 4, الرابع: 4,
  الخامسه: 5, الخامس: 5, السادسه: 6, السادس: 6, السابعه: 7, السابع: 7, الثامنه: 8, الثامن: 8,
  التاسعه: 9, التاسع: 9, العاشره: 10, العاشر: 10,
};
const DEICTIC = /(هذه|هذي|تلك) (الايه|الايات)|الايه (السابقه|الحاليه)|هذه السوره/;

// ── Tokenisation ─────────────────────────────────────────────────────────

/** Arabic-Indic / Persian digits → ASCII. */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Normalize words like normalizeArabic but keep numbers (it strips digits). */
function normalizeKeepNumbers(s: string): string {
  const withRanges = s.replace(/(\d+)\s*[-–—]\s*(\d+)/g, "$1 الي $2");
  return withRanges
    .split(/(\d+)/)
    .map((part) => (/^\d+$/.test(part) ? ` ${part} ` : ` ${normalizeArabic(part)} `))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Variants of a token with leading clitics removed: "وبسوره" → ["وبسوره","بسوره","سوره"]. */
function clitics(tok: string): string[] {
  const out = [tok];
  if (tok.startsWith("لل") && tok.length > 3) out.push(`ال${tok.slice(2)}`); // للناس → الناس
  let t = tok;
  for (let i = 0; i < 2 && t.length > 3 && /^[وفبل]/.test(t); i++) {
    t = t.slice(1);
    out.push(t);
  }
  return out;
}

const isNum = (t: string | undefined) => t != null && /^\d+$/.test(t);

interface SurahMention {
  surah: number;
  pos: number;
  end: number; // index after the name
}
interface AyahMention {
  from: number;
  to: number;
  pos: number;
  /** surah attached directly (e.g. "19:32" or "مريم 32") */
  surah?: number;
  /** token index right after the number(s) */
  next?: number;
}

function matchNameAt(tokens: string[], i: number, strong: boolean): { entry: NameEntry; len: number } | null {
  for (const entry of NAMES) {
    if (entry.strongOnly && !strong) continue;
    const len = entry.tokens.length;
    if (i + len > tokens.length) continue;
    let ok = true;
    for (let k = 0; k < len; k++) {
      const cands = k === 0 ? clitics(tokens[i]) : [tokens[i + k]];
      if (!cands.includes(entry.tokens[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return { entry, len };
  }
  return null;
}

/** Read "N", "N الي M", "من N الي M" starting at i. */
function readNumberRange(tokens: string[], i: number): { from: number; to: number; next: number } | null {
  let j = i;
  if (tokens[j] === "من" || tokens[j] === "رقم") j++;
  if (isNum(tokens[j])) {
    const from = Number(tokens[j]);
    if (RANGE_JOINERS.has(tokens[j + 1]) && isNum(tokens[j + 2])) {
      return { from, to: Number(tokens[j + 2]), next: j + 3 };
    }
    return { from, to: from, next: j + 1 };
  }
  const ord = ORDINALS[tokens[j]];
  if (ord) return { from: ord, to: ord, next: j + 1 };
  if (tokens[j] === "الاخيره") return { from: -1, to: -1, next: j + 1 }; // resolved to the last ayah later
  return null;
}

// ── Main entry ───────────────────────────────────────────────────────────

export function findReferences(question: string): { surahs: SurahMention[]; ayahs: AyahMention[]; deictic: boolean } {
  let text = toLatinDigits(question);
  const ayahs: AyahMention[] = [];

  // Explicit verse keys "19:32" / "19:32-35" (any position). Removed afterwards.
  text = text.replace(/(\d{1,3})\s*[:：]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/g, (_, s, a, b) => {
    ayahs.push({ surah: Number(s), from: Number(a), to: Number(b ?? a), pos: -1 });
    return " ";
  });

  const tokens = normalizeKeepNumbers(text).split(" ").filter(Boolean);
  const surahs: SurahMention[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const isSurahWord = clitics(tokens[i]).some((t) => SURAH_WORDS.has(t));
    if (isSurahWord) {
      const m = matchNameAt(tokens, i + 1, true);
      if (m) {
        surahs.push({ surah: m.entry.surah, pos: i, end: i + 1 + m.len });
        i += m.len;
        continue;
      }
      // "سورة رقم 19" / "سورة 19"
      const j = tokens[i + 1] === "رقم" ? i + 2 : i + 1;
      if (isNum(tokens[j]) && !AYAH_WORDS.has(tokens[j + 1] ?? "")) {
        surahs.push({ surah: Number(tokens[j]), pos: i, end: j + 1 });
        i = j;
      }
      continue;
    }

    if (clitics(tokens[i]).some((t) => AYAH_WORDS.has(t))) {
      const r = readNumberRange(tokens, i + 1);
      if (r) {
        ayahs.push({ from: r.from, to: r.to, pos: i, next: r.next });
        i = r.next - 1;
      }
      continue;
    }

    const m = matchNameAt(tokens, i, false);
    if (m) {
      const followedByNumber = isNum(tokens[i + m.len]);
      if (m.entry.ambiguous && !followedByNumber) continue;
      surahs.push({ surah: m.entry.surah, pos: i, end: i + m.len });
      i += m.len - 1;
    }
  }

  // "مريم 32" / "سورة مريم 32-35": a number right after a surah name is an ayah.
  for (const s of surahs) {
    if (isNum(tokens[s.end])) {
      const r = readNumberRange(tokens, s.end)!;
      ayahs.push({ surah: s.surah, from: r.from, to: r.to, pos: s.end });
    }
  }

  // "الآية 3 من سورة الكهف" / "الآية 3 في الكهف": bind to the surah named right after.
  for (const a of ayahs) {
    if (a.surah || a.next == null) continue;
    const link = tokens[a.next] === "من" || tokens[a.next] === "في" ? a.next + 1 : a.next;
    const hit = surahs.find((s) => s.pos === link || s.pos === a.next);
    if (hit) a.surah = hit.surah;
  }

  return { surahs, ayahs, deictic: DEICTIC.test(tokens.join(" ")) };
}

function validRange(surah: number, from: number, to: number): AyahRange | null {
  const meta = getSurahMeta(surah);
  if (!meta) return null;
  if (from === -1) from = to = meta.ayahCount; // "الآية الأخيرة"
  if (from < 1 || from > meta.ayahCount) return null;
  const end = Math.min(Math.max(to, from), meta.ayahCount);
  return { surah, from, to: end };
}

export function parseReferences(question: string, context: ReferenceContext = {}): ParsedReferences {
  const found = findReferences(question);
  const surahs: number[] = [];
  for (const s of found.surahs) if (getSurahMeta(s.surah) && !surahs.includes(s.surah)) surahs.push(s.surah);
  for (const a of found.ayahs) if (a.surah && getSurahMeta(a.surah) && !surahs.includes(a.surah)) surahs.push(a.surah);

  const ctxSurah = context.surah && getSurahMeta(context.surah) ? context.surah : undefined;
  const ranges: AyahRange[] = [];
  let fromContext = false;

  for (const a of found.ayahs) {
    let surah = a.surah;
    if (!surah) {
      if (found.surahs.length === 1) surah = found.surahs[0].surah;
      else if (found.surahs.length > 1) {
        // attach to the nearest mention (usually "الآية 5 من سورة …")
        surah = [...found.surahs].sort((x, y) => Math.abs(x.pos - a.pos) - Math.abs(y.pos - a.pos))[0].surah;
      } else if (ctxSurah) {
        surah = ctxSurah;
        fromContext = true;
      }
    }
    if (!surah) continue;
    const r = validRange(surah, a.from, a.to);
    if (r && !ranges.some((x) => x.surah === r.surah && x.from === r.from && x.to === r.to)) ranges.push(r);
  }
  for (const r of ranges) if (!surahs.includes(r.surah)) surahs.push(r.surah);

  // Nothing explicit, or "هذه الآية": fall back to what the user is looking at.
  if (ctxSurah && (surahs.length === 0 || (found.deictic && surahs.length === 1 && surahs[0] === ctxSurah && !ranges.length))) {
    if (!surahs.includes(ctxSurah)) surahs.push(ctxSurah);
    if (context.ayah && !ranges.length) {
      const r = validRange(ctxSurah, context.ayah, context.ayah);
      if (r) ranges.push(r);
    }
    fromContext = true;
  }

  return { surahs, ranges, storySlug: context.storySlug, fromContext };
}

/** Total ayahs covered by a set of ranges. */
export function rangeSize(ranges: AyahRange[]): number {
  return ranges.reduce((n, r) => n + (r.to - r.from + 1), 0);
}
