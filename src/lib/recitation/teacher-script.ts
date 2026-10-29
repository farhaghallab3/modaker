/**
 * «الشيخ المعلّم»: what the teacher says after a recitation, as a short script of segments:
 *   { say }   a sentence in the teacher's (synthetic) voice: praise, what was read and skipped, what to fix
 *   { word }  one word of the Quran, played from a HUMAN reciter (word-by-word audio)
 *   { ayah }  one ayah, played from a human reciter
 *
 * Built from FACTS computed by the app (word check + tajweed check). The script is written by a free AI model
 * (server/teacher.ts) or, when it is unavailable, by the template below. Either way it is validated here:
 * a sentence may never contain Quran text (the AI voice never "recites"); the Quran is heard only in a reciter's voice.
 * Pure: shared by the server and the tests.
 */
import { matchKey, tokenize } from "@/lib/quran/normalize";
import type { RecitationAnalysis } from "@/lib/types";
import { ayahsNotRecited } from "./coach-feedback";
import { TAJWEED_RULES, notePlace, tajweedReason, type TajweedResult } from "./tajweed-notes";

export type ScriptSegment = { say: string } | { word: { ayah: number; word: number } } | { ayah: number };

/** A segment as the app receives it: each sentence comes signed for the voice (null when the voice is off). */
export type TeacherSegmentOut =
  | { say: string; speech: { text: string; exp: number; sig: string } | null }
  | { word: { ayah: number; word: number } }
  | { ayah: number };

export interface TeacherScriptResponse {
  source: "ai" | "template";
  segments: TeacherSegmentOut[];
}

/** Neighbouring sentences are joined: fewer voice calls, and the teacher speaks in one breath until a word is played. */
export function joinSayings(segments: ScriptSegment[]): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if ("say" in s && last && "say" in last) out[out.length - 1] = { say: `${last.say} ${s.say}` };
    else out.push(s);
  }
  return out;
}

export interface TeacherFacts {
  /** Overall word match, 0–100. */
  accuracyPercent: number;
  ayahs: {
    ayah: number;
    status: "mastered" | "needs-review" | "missed" | "uncertain";
    wordsTotal: number;
    wordsCorrect: number;
    /** The tajweed checker heard (part of) this ayah. */
    heardByTajweedChecker: boolean;
  }[];
  /** Words the word check flagged: omitted (not said), different (said differently), unclear (could not tell). */
  wordProblems: { id: string; place: string; problem: "omitted" | "different" | "unclear" }[];
  /** Ayahs with no word heard at all. */
  notRecited: number[];
  extraWords: number;
  tajweedChecked: boolean;
  /** Tajweed notes with the exact explanation to give (letter names and rules only). */
  tajweedNotes: { id: string; place: string; what: string }[];
  /** Tajweed rules read well (for specific praise). */
  tajweedGood: { id: string; place: string; rule: string }[];
  /** The sentence the teacher already said the moment the result appeared (do not repeat it). */
  alreadySaid: string;
}

/** Word ids the script may play: "w<ayah>_<wordIndex>". */
export const wordId = (ayah: number, word: number) => `w${ayah}_${word}`;

const MAX_PROBLEMS = 4;
const MAX_TAJWEED = 3;

/** Facts for the teacher, from the word check and (when it ran) the tajweed check. No Quran text. */
export function buildTeacherFacts(analysis: RecitationAnalysis, tajweed: TajweedResult | null, alreadySaid = ""): TeacherFacts {
  const heard = new Set(tajweed?.heardAyahs ?? []);
  const notRecited = ayahsNotRecited(analysis);
  const wordProblems: TeacherFacts["wordProblems"] = [];
  for (const a of analysis.ayahs) {
    if (notRecited.includes(a.ayah)) continue; // said as «لم أسمع الآية …», not word by word
    a.words.forEach((w, i) => {
      if (w.state === "ok" || wordProblems.length >= MAX_PROBLEMS) return;
      const problem = w.state === "omitted" ? "omitted" : w.state === "incorrect" ? "different" : "unclear";
      wordProblems.push({ id: wordId(a.ayah, i), place: place(a.ayah, i, a.words.length), problem });
    });
  }
  const notes = (tajweed?.notes ?? []).slice(0, MAX_TAJWEED);
  return {
    accuracyPercent: Math.round((analysis.expectedWords ? analysis.matchedWords / analysis.expectedWords : 0) * 100),
    ayahs: analysis.ayahs.map((a) => ({
      ayah: a.ayah,
      status: a.status,
      wordsTotal: a.words.length,
      wordsCorrect: a.words.filter((w) => w.state === "ok").length,
      heardByTajweedChecker: heard.has(a.ayah),
    })),
    wordProblems,
    notRecited,
    extraWords: analysis.extraWords.length,
    tajweedChecked: Boolean(tajweed && tajweed.matched > 0),
    tajweedNotes: notes.map((n) => ({ id: wordId(n.ayah, n.word), place: notePlace(n), what: tajweedReason(n).speech })),
    tajweedGood: (tajweed?.good ?? []).slice(0, 4).map((g) => ({ id: wordId(g.ayah, g.word), place: place(g.ayah, g.word, g.wordsInAyah), rule: TAJWEED_RULES[g.rule] })),
    alreadySaid,
  };
}

function place(ayah: number, word: number, wordsInAyah: number): string {
  return notePlace({ ayah, word, wordsInAyah, kind: "letters", op: "replace", rule: null, expectedLen: null, heardLen: null, letter: "", expected: "", heard: "" });
}

const ORD = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];
const ayahName = (n: number) => (n <= 10 ? `الآية ${ORD[n - 1]}` : `الآية رقم ${n}`);
function ayahList(ns: number[]): string {
  if (ns.length === 1) return ayahName(ns[0]);
  const names = ns.map((n) => (n <= 10 ? ORD[n - 1] : `رقم ${n}`));
  return `${ns.length === 2 ? "الآيتين" : "الآيات"} ${names.slice(0, -1).join(" و")} و${names[names.length - 1]}`;
}

/** Picks a phrase from a pool, the same one for the same seed (so tests are stable, and attempts still vary). */
function pick(pool: string[], seed: number, salt: number): string {
  return pool[Math.abs((seed * 31 + salt * 17) | 0) % pool.length];
}

const PRAISE_ALL = ["ما شاء الله، قراءة متقنة.", "تبارك الله، أحسنت كثيرًا.", "ما شاء الله، حفظك ثابت وقراءتك جميلة."];
const PRAISE_SOME = ["ما شاء الله، أحسنت في", "بارك الله فيك، قرأت جيدًا", "جميل جدًا، أتقنت"];
const ENCOURAGE_LOW = ["لا بأس أبدًا، كل محاولة تقرّبك من الإتقان.", "لا تحزن، الحفظ يثبت بالتكرار، وأنا معك.", "بداية طيبة، وسنصل معًا إن شاء الله."];
const CLOSE = ["أعد المحاولة بهدوء، وأنا أستمع إليك.", "جرّب مرة أخرى بتأنٍّ، وستكون أجمل إن شاء الله.", "أنت على خير، أعدها الآن وسأسمعك."];

/** The teacher's script without an AI model: same facts, fixed but varied sentences. */
export function templateScript(f: TeacherFacts, seed = 0): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  const mastered = f.ayahs.filter((a) => a.status === "mastered").map((a) => a.ayah);
  const problems = f.wordProblems.length + f.tajweedNotes.length;

  // 1) praise what was right, specifically
  if (mastered.length === f.ayahs.length && !problems) out.push({ say: pick(PRAISE_ALL, seed, 1) });
  else if (mastered.length) out.push({ say: `${pick(PRAISE_SOME, seed, 2)} ${ayahList(mastered)}.` });
  else out.push({ say: pick(ENCOURAGE_LOW, seed, 3) });
  const good = f.tajweedGood[0];
  if (good) out.push({ say: `وأعجبني ${good.rule} في ${good.place}، أحسنت فيه.` });

  // 2) what was not heard
  if (f.notRecited.length) {
    const heardAnyway = f.notRecited.filter((n) => f.ayahs.find((a) => a.ayah === n)?.heardByTajweedChecker);
    out.push({
      say: heardAnyway.length === f.notRecited.length
        ? `سمعت صوتك في ${ayahList(f.notRecited)}، لكن لم أتبيّن ${f.notRecited.length === 2 ? "كلماتهما. أعدهما" : "كلماتها. أعدها"} بصوت أوضح.`
        : `لم أسمع ${ayahList(f.notRecited)}. ${f.notRecited.length === 2 ? "أكملهما" : "أكملها"} في المرة القادمة.`,
    });
  }

  // 3) each word to fix, then the sheikh says it
  const lead = (i: number) => (i === 0 ? "" : "وكذلك ");
  f.wordProblems.forEach((p, i) => {
    const [ayah, word] = parseWordId(p.id)!;
    const what = p.problem === "omitted" ? "لم أسمعها منك" : p.problem === "different" ? "يبدو أنك قرأتها بشكل مختلف" : "لم أتبيّنها جيدًا";
    out.push({ say: `${lead(i)}في ${p.place} ${what}. اسمعها من الشيخ:` }, { word: { ayah, word } });
  });
  f.tajweedNotes.forEach((n, i) => {
    const [ayah, word] = parseWordId(n.id)!;
    out.push({ say: `${i === 0 ? "وفي التجويد" : "وأيضًا"}، في ${n.place}: ${n.what} اسمعها من الشيخ:` }, { word: { ayah, word } });
  });

  // 4) close with encouragement
  out.push({ say: problems || f.notRecited.length ? pick(CLOSE, seed, 4) : "ثبّتك الله وزادك من فضله." });
  return out;
}

export function parseWordId(id: string): [number, number] | null {
  const m = /^w(\d{1,3})_(\d{1,3})$/.exec(id);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// ── validation ──────────────────────────────────────────────────────────────

const MAX_SEGMENTS = 14;
const MAX_SAY = 240;
const MAX_TOTAL = 1100;
/** Common phrases of praise that also occur in the Quran: allowed in the teacher's sentences. */
const ALLOWED_PHRASES = ["الحمد لله", "ما شاء الله", "بارك الله فيك", "بارك الله", "إن شاء الله", "ان شاء الله", "تبارك الله", "جزاك الله خيرا", "زادك الله", "ثبتك الله", "الله"];
/** Religious content the teacher must never produce (rulings, hadith, verse quotes). */
const FORBIDDEN = /قال تعالى|قال الله|قال رسول|حديث|فتوى|حلال|حرام|بدعة|﴿|﴾|ﷺ|ﷻ/;

/**
 * Does this sentence contain Quran text from these ayahs? Two consecutive words of an ayah, or one long distinctive
 * word, after removing common phrases of praise. Then the sentence must not be spoken.
 */
export function containsQuranText(say: string, ayahTexts: string[]): boolean {
  let s = ` ${tokenize(say).join(" ")} `;
  for (const p of ALLOWED_PHRASES) s = s.split(` ${tokenize(p).join(" ")} `).join(" | ");
  const keys = s.split(" ").filter(Boolean).map((w) => (w === "|" ? "|" : matchKey(w)));
  const pairs = new Set<string>();
  const long = new Set<string>();
  for (const t of ayahTexts) {
    const k = tokenize(t).map(matchKey);
    k.forEach((w, i) => {
      if (w.length >= 4) long.add(w);
      if (i) pairs.add(`${k[i - 1]} ${w}`);
    });
  }
  return keys.some((w, i) => long.has(w) || (i > 0 && w !== "|" && keys[i - 1] !== "|" && pairs.has(`${keys[i - 1]} ${w}`)));
}

/**
 * Checks a script (from the AI model) against the facts. Returns the clean script, or null when anything is off
 * (then the template is used). Word segments may only point at words the facts name.
 */
export function validateScript(raw: unknown, facts: TeacherFacts, ayahTexts: string[]): ScriptSegment[] | null {
  const segs = raw && typeof raw === "object" && Array.isArray((raw as { segments?: unknown }).segments) ? (raw as { segments: unknown[] }).segments : null;
  if (!segs || !segs.length || segs.length > MAX_SEGMENTS) return null;
  const words = new Set([...facts.wordProblems, ...facts.tajweedNotes, ...facts.tajweedGood].map((w) => w.id));
  const ayahs = new Set(facts.ayahs.map((a) => a.ayah));
  const allowedNumbers = new Set<number>([facts.accuracyPercent, facts.extraWords, ...facts.ayahs.flatMap((a) => [a.ayah, a.wordsTotal, a.wordsCorrect])]);
  const out: ScriptSegment[] = [];
  let total = 0;
  for (const seg of segs) {
    const x = (seg ?? {}) as Record<string, unknown>;
    if (typeof x.say === "string") {
      const say = x.say.replace(/\s+/g, " ").trim();
      if (!say) continue;
      if (say.length > MAX_SAY || FORBIDDEN.test(say)) return null;
      if ((say.match(/[ً-ْٰ]/g) ?? []).length > 8) return null; // looks like vocalized scripture
      const nums = (say.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+/g) ?? []).map(Number);
      if (nums.some((n) => !allowedNumbers.has(n))) return null;
      if (containsQuranText(say, ayahTexts)) return null;
      total += say.length;
      out.push({ say });
    } else if (typeof x.word === "string") {
      const id = parseWordId(x.word);
      if (!id || !words.has(x.word)) return null;
      out.push({ word: { ayah: id[0], word: id[1] } });
    } else if (Number.isInteger(x.ayah) && ayahs.has(x.ayah as number)) {
      if (out.some((s) => "ayah" in s)) return null; // at most one full ayah
      out.push({ ayah: x.ayah as number });
    } else return null;
  }
  if (!out.some((s) => "say" in s) || total > MAX_TOTAL) return null;
  return out;
}

/** Loose JSON parse of a model answer (tolerates a code fence or text around the object). */
export function parseScriptJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
