/**
 * Validation of the coach model's structured answer against the COMPUTED facts. Pure.
 * The model may phrase and choose among allowed actions; it may not introduce numbers, surahs, Quran text or
 * religious content that the facts do not contain.
 */
import { SURAHS, toArabicDigits } from "@/lib/quran/surahs";
import type { CoachActionId, CoachInput } from "./facts";

export interface CoachAnswer {
  message: string;
  primary: CoachActionId;
  secondary: CoachActionId | null;
}

const MAX_CHARS = 320;
const MAX_SENTENCES = 3;
/** Religious / ruling / scripture vocabulary the coach must never produce. */
const FORBIDDEN = /قال تعالى|قال الله|قال رسول|حديث|فتوى|حلال|حرام|واجب شرع|يجب شرع|فرض عين|سنة مؤكدة|مستحب|مكروه|بدعة|ثواب|آية كريمة|﴿|﴾|تجويد|مخارج|غنة|إدغام|إخفاء/;

const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** Every integer appearing anywhere in the facts the model was shown (counts, ayah numbers, range ends). */
export function allowedNumbers(input: CoachInput): Set<number> {
  const out = new Set<number>(); // only numbers that really appear in the facts
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isInteger(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      // the size of a range is a fact derived from its ends («الآيات ١٢–١٦» = 5 آيات)
      if (typeof o.from === "number" && typeof o.to === "number" && o.to >= o.from) out.add(o.to - o.from + 1);
      Object.values(o).forEach(walk);
    }
  };
  walk({ ...input, actions: undefined });
  return out;
}

function surahNames(input: CoachInput): Set<string> {
  const names = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (k === "surahName" && typeof x === "string" ? names.add(x) : walk(x));
  };
  walk(input);
  return names;
}

export function validateCoachAnswer(raw: unknown, input: CoachInput): CoachAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.message !== "string") return null;
  const message = r.message.replace(/\s+/g, " ").trim();
  if (message.length < 12 || message.length > MAX_CHARS) return null;
  if (message.split(/[.!؟?۔]+/).filter((x) => x.trim()).length > MAX_SENTENCES) return null;
  if (FORBIDDEN.test(message)) return null;
  if ((message.match(/[ً-ْٰ]/g) ?? []).length > 6) return null; // looks like vocalized scripture

  const ids = new Set(input.actions.map((a) => a.id));
  const rec = new Set(input.recommended);
  const primary = r.primary as CoachActionId;
  const secondary = (r.secondary ?? null) as CoachActionId | null;
  if (!ids.has(primary) || !rec.has(primary)) return null;
  if (secondary !== null && (!ids.has(secondary) || !rec.has(secondary) || secondary === primary)) return null;
  // a deterministic order is a fact: review before new memorization when reviews/weak spots are due
  if ((input.order === "weak-first" || input.order === "review-first") && primary === "memorize") return null;

  // numbers must come from the facts
  const allowed = allowedNumbers(input);
  for (const m of toWestern(message).match(/\d+/g) ?? []) if (!allowed.has(Number(m))) return null;
  // only surahs that appear in the facts may be named
  const known = surahNames(input);
  for (const s of SURAHS) if (!known.has(s.nameAr) && message.includes(`سورة ${s.nameAr}`)) return null;

  return { message: toArabicDigits(message), primary, secondary };
}

/** Extract the first JSON object from a model reply (tolerates code fences). */
export function parseJsonLoose(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}
