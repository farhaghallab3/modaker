/**
 * Safety router: decides HOW a question may be answered before any retrieval or generation.
 *
 *   Level A  stable sourced material (Quran text, quizzes built from verified verses)
 *   Level B  explanation — only from approved retrieved material, with citations
 *   Level C  disputed / high-sensitivity — conservative, sourced, no independent ruling
 *   Level D  personal fatwa / case — no ruling; neutral referral
 *
 * The router is built from NAMED SIGNALS (personal_case, ruling_request, disagreement,
 * sensitive_topic, injection, hostile, …) computed by deterministic detectors over data in
 * lexicon.ts; the level is derived from the signals, not from one big keyword list.
 *
 * Extensible classifiers (e.g. a future model) may only ESCALATE: `applyClassifiers` takes the
 * maximum of the deterministic level and the classifier's, never lowers it, and ignores a
 * classifier entirely once the deterministic level is D. A classifier cannot change the intent or
 * re-enable generation either.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import type { SafetyLevel } from "@/lib/types";
import * as L from "./lexicon";

export type Intent =
  | "quran-text"
  | "quiz"
  | "explain"
  | "story"
  | "asbab"
  | "word-meaning"
  | "general"
  | "hadith-request"
  | "non-arabic"
  | "off-topic"
  | "personal-case";

export interface Signal {
  id:
    | "personal_case"
    | "ruling_request"
    | "explicit_fatwa"
    | "disagreement"
    | "sensitive_topic"
    | "hadith_request"
    | "injection"
    | "hostile"
    | "non_arabic"
    | "quran_request"
    | "off_topic";
  note?: string;
}

export interface RouteDecision {
  level: SafetyLevel;
  intent: Intent;
  signals: Signal[];
  /** Human-readable reasons (for logs and tests). */
  reasons: string[];
  flags: {
    /** The question supplies facts about the asker's own situation (see detectPersonalFacts). */
    personalCase: boolean;
    /** Which kinds of personal facts were found (empty for general questions phrased in the first person). */
    personalFacts: string[];
    rulingRequest: boolean;
    explicitFatwa: boolean;
    disagreement: boolean;
    sensitiveTopic: string | null;
    hostile: boolean;
    injection: boolean;
    nonArabic: boolean;
  };
  /** Question with injection phrases and insults removed — what retrieval and reference parsing use. */
  cleanedQuestion: string;
  /** May an LLM be used for this question? (Also needs a configured provider and the global switch.) */
  generationAllowed: boolean;
  /** Level D / personal-case: answer with the neutral referral. */
  referral: boolean;
  /** "rules" or "rules+<classifier ids>" */
  decidedBy: string;
}

export interface RouteOptions {
  /** Global switch (ASSISTANT_GENERATION=on) AND a provider exists. Default false. */
  generationEnabled?: boolean;
}

const ORDER: Record<SafetyLevel, number> = { A: 0, B: 1, C: 2, D: 3 };
export const maxLevel = (a: SafetyLevel, b: SafetyLevel): SafetyLevel => (ORDER[a] >= ORDER[b] ? a : b);

const n = (s: string) => normalizeArabic(s);

/** Normalize like normalizeArabic but keep digits (reference parsing needs "الآية 5"). */
function normalizeKeepDigits(s: string): string {
  return s
    .split(/([0-9٠-٩۰-۹]+)/)
    .map((part, i) => (i % 2 ? ` ${part} ` : ` ${n(part)} `))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** "ي ج و ز" → "يجوز": defeats letter-spacing used to dodge pattern matching. */
export function joinSpacedLetters(s: string): string {
  const parts = s.split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const p of parts) {
    if (/^[ء-ي]$/.test(p)) run.push(p);
    else {
      flush();
      out.push(p);
    }
  }
  flush();
  return out.join(" ");
}

export function detectLanguage(s: string): { arabicRatio: number; latin: number; nonArabic: boolean } {
  const arabic = (s.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (s.match(/[A-Za-z]/g) ?? []).length;
  const total = arabic + latin;
  const arabicRatio = total ? arabic / total : 1;
  return { arabicRatio, latin, nonArabic: latin >= 3 && arabicRatio < 0.4 };
}

function stripInjection(text: string): { cleaned: string; found: boolean } {
  let found = false;
  let t = normalizeKeepDigits(text);
  for (const re of L.INJECTION_AR) {
    t = t.replace(re, () => {
      found = true;
      return " ";
    });
  }
  let raw = text;
  for (const re of L.INJECTION_EN) {
    raw = raw.replace(re, () => {
      found = true;
      return " ";
    });
  }
  // Prefer the normalized Arabic residue; for non-Arabic text keep the English residue.
  const cleaned = detectLanguage(text).nonArabic ? raw : t;
  return { cleaned: cleaned.replace(/\s+/g, " ").trim(), found };
}

function stripHostile(text: string): { cleaned: string; found: boolean } {
  let found = false;
  const arabicHit = L.HOSTILE_AR.test(` ${n(text)} `);
  const englishHit = L.HOSTILE_EN.test(text);
  if (arabicHit || englishHit) found = true;
  if (!found) return { cleaned: text, found: false };
  // Drop the insult words and a preceding "أنتم" so retrieval sees the substance of the question.
  const tokens = text.split(/\s+/).filter((tok) => {
    const nt = ` ${n(tok)} `;
    return !L.HOSTILE_AR.test(nt) && !L.HOSTILE_EN.test(tok) && !/^(?:انتم|أنتم|you)$/i.test(tok.replace(/[^\p{L}]/gu, ""));
  });
  return { cleaned: tokens.join(" ").trim(), found: true };
}

export interface PersonalFacts {
  /** Strong kinds count 2 each, weak kinds 1 each (each kind counted once). */
  score: number;
  /** Facts that describe the ASKER (inherently, or because a self-statement anchors them). */
  strong: string[];
  weak: string[];
  /** Facts that could describe anyone («للحامل», «حدث كذا») and have no anchor to the asker. */
  unanchored: string[];
}

/**
 * Does the question describe the asker's OWN situation, or is it a general question?
 *
 * Only facts count: a relationship/possession («زواجي», «عقدي»), a first-person event («نسيت»,
 * «حلفت»), a request for what to DO («ماذا أفعل»), the asker's own place, an unspecified act of the
 * asker. First-person WORDING («هل يجوز لي», «أنا», "can I") is not a fact.
 *
 * Some facts are ambiguous about WHO they describe — a condition («حامل», «مريض»), a third-person
 * event («حدث كذا»), a named jurisdiction («في دولة كذا»). «هل يجوز للحامل الإفطار؟» is general; «أنا
 * حامل ولا أستطيع الصيام» is personal. Those kinds count only when a self-statement («أنا», «لدي»,
 * «عندي») anchors them to the asker.
 */
export function detectPersonalFacts(nq: string, raw: string, nonArabic: boolean): PersonalFacts {
  const own: string[] = [];
  const contextual: string[] = [];
  const weak: string[] = [];
  if (nonArabic) {
    if (L.EN_FACT_STRONG.test(raw)) own.push("english_fact"); // all first-person by construction
    if (L.EN_FACT_WEAK.test(raw)) weak.push("english_first_person");
  } else {
    if (L.FACT_RELATION.test(nq)) own.push("relationship");
    if (L.FACT_EVENT.test(nq)) own.push("event");
    if (L.FACT_ACTION_SEEKING.test(nq)) own.push("action_seeking");
    if (L.FACT_JURISDICTION.test(nq)) own.push("jurisdiction");
    if (L.FACT_SPECIFIC_ACT.test(nq.trim())) own.push("specific_act");
    if (L.FACT_CIRCUMSTANCE.test(nq)) contextual.push("circumstance");
    if (L.FACT_EVENT_3P.test(nq)) contextual.push("event");
    if (L.FACT_JURISDICTION_GENERIC.test(nq)) contextual.push("jurisdiction");
    if (L.FACT_WEAK_SELF.test(nq)) weak.push("self_statement");
    if (L.FACT_WEAK_CAUSE.test(nq)) weak.push("cause");
  }
  const anchored = weak.includes("self_statement");
  const strong = [...own, ...(anchored ? contextual.filter((k) => !own.includes(k)) : [])];
  const unanchored = anchored ? [] : contextual.filter((k) => !own.includes(k));
  return { score: strong.length * 2 + weak.length, strong, weak, unanchored };
}

const GENERATION_INTENTS: Intent[] = ["explain", "story", "word-meaning", "general"];

export function routeDeterministic(question: string, opts: RouteOptions = {}): RouteDecision {
  const original = question.trim();
  const joined = joinSpacedLetters(original);
  const inj = stripInjection(joined);
  const hostile = stripHostile(inj.cleaned);
  const cleaned = hostile.cleaned;

  const lang = detectLanguage(cleaned || original);
  const nq = ` ${n(cleaned)} `;
  const raw = cleaned.toLowerCase();
  const signals: Signal[] = [];
  const reasons: string[] = [];
  const add = (id: Signal["id"], note?: string) => {
    signals.push({ id, note });
    reasons.push(note ? `${id}:${note}` : id);
  };

  if (inj.found) add("injection");
  if (hostile.found) add("hostile");
  if (lang.nonArabic) add("non_arabic");

  const tajweed = L.TAJWEED.test(nq);
  const explicitFatwa = L.EXPLICIT_FATWA.test(nq) || L.EN_EXPLICIT_FATWA.test(raw);
  const englishReligious = lang.nonArabic && L.EN_RELIGIOUS.test(raw);
  const rulingFraming =
    (L.RULING_FRAMING.test(nq) && !tajweed) ||
    (lang.nonArabic && (L.EN_RULING.test(raw) || (L.EN_MODAL_FRAMING.test(raw) && englishReligious)));
  let rulingTopic = L.RULING_TOPIC.test(nq) && !tajweed;
  // «هل أستطيع / هل يمكنني …» about a religious practice is a permission question, i.e. a ruling request.
  const permissionAboutPractice = L.PERMISSION_FRAMING.test(nq) && L.PRACTICE_TOPIC.test(nq) && !tajweed;
  const explanatory = L.EXPLANATORY.test(nq);
  // "ما معنى كلمة الحلال في سورة البقرة": an explanatory question about a text, not a ruling request.
  if (rulingTopic && explanatory && !rulingFraming) rulingTopic = false;
  const rulingRequest = rulingFraming || rulingTopic || permissionAboutPractice;

  // Personal = the asker supplied facts about their own situation (not merely first-person wording).
  const facts = detectPersonalFacts(nq, raw, lang.nonArabic);
  const practiceContext = L.PRACTICE_TOPIC.test(nq) || (lang.nonArabic && englishReligious) || facts.strong.includes("action_seeking");
  const personalCase = facts.strong.length >= 1 && facts.score >= 2 && (rulingRequest || practiceContext);

  const disagreement = L.DISAGREEMENT.test(nq) || (lang.nonArabic && L.EN_DISAGREEMENT.test(raw));
  const sensitiveTopic =
    L.SENSITIVE_TOPICS.find((t) => t.patterns.test(nq))?.id ??
    (lang.nonArabic ? L.EN_SENSITIVE.find((t) => t.patterns.test(raw))?.id : undefined) ??
    null;
  const hadith = L.HADITH_REQUEST.test(nq) || (lang.nonArabic && L.EN_HADITH.test(raw));

  if (explicitFatwa) add("explicit_fatwa");
  if (rulingRequest) add("ruling_request");
  if (personalCase) add("personal_case", [...facts.strong, ...facts.weak].join("+"));
  if (disagreement) add("disagreement");
  if (sensitiveTopic) add("sensitive_topic", sensitiveTopic);
  if (hadith) add("hadith_request");

  // ── level ──
  let level: SafetyLevel = "B";
  if (explicitFatwa || personalCase) level = "D";
  else if (rulingRequest || disagreement || sensitiveTopic) level = "C";

  // ── intent ──
  const religious = L.RELIGIOUS.test(nq) || L.EN_RELIGIOUS.test(raw);
  let intent: Intent;
  if (level === "D") intent = "personal-case";
  else if (lang.nonArabic) intent = religious ? "non-arabic" : "off-topic";
  else if (hadith) intent = "hadith-request";
  else if (L.QURAN_TEXT.test(nq)) intent = "quran-text";
  else if (L.QUIZ.test(nq)) intent = "quiz";
  else if ((L.OFF_TOPIC.test(nq) || L.OFF_TOPIC.test(raw)) && !religious) intent = "off-topic";
  else if (L.ASBAB.test(nq)) intent = "asbab";
  else if (L.WORD_MEANING.test(nq)) intent = "word-meaning";
  else if (L.STORY.test(nq)) intent = "story";
  else if (L.EXPLAIN.test(nq)) intent = "explain";
  else intent = "general";
  if (intent === "off-topic") add("off_topic");
  if (intent === "quran-text" || intent === "quiz") add("quran_request");

  // Deterministic intents over verified verses are Level A (nothing is generated or ruled on).
  if (level === "B" && (intent === "quran-text" || intent === "quiz")) level = "A";

  const generationAllowed = Boolean(opts.generationEnabled) && level === "B" && GENERATION_INTENTS.includes(intent) && !inj.found;

  return {
    level,
    intent,
    signals,
    reasons,
    flags: {
      personalCase,
      personalFacts: [...facts.strong, ...facts.weak],
      rulingRequest,
      explicitFatwa,
      disagreement,
      sensitiveTopic,
      hostile: hostile.found,
      injection: inj.found,
      nonArabic: lang.nonArabic,
    },
    cleanedQuestion: cleaned,
    generationAllowed,
    referral: level === "D",
    decidedBy: "rules",
  };
}

// ── extensible classifiers (escalation only) ─────────────────────────────

export interface ClassifierVerdict {
  level?: SafetyLevel;
  reasons?: string[];
}

export interface SafetyClassifier {
  readonly id: string;
  classify(question: string, decision: RouteDecision): Promise<ClassifierVerdict | null>;
}

/**
 * Merge classifier verdicts into a deterministic decision. A verdict can only RAISE the level;
 * if the deterministic level is already D, classifiers are not even consulted. Raising to C or D
 * switches generation off; nothing a classifier returns can turn it on or change the intent.
 */
export async function applyClassifiers(decision: RouteDecision, question: string, classifiers: SafetyClassifier[] = []): Promise<RouteDecision> {
  if (decision.level === "D" || !classifiers.length) return decision;
  let out = decision;
  for (const c of classifiers) {
    let verdict: ClassifierVerdict | null = null;
    try {
      verdict = await c.classify(question, out);
    } catch {
      // A failing classifier must never weaken (or break) the deterministic decision.
      continue;
    }
    if (!verdict?.level) continue;
    const next = maxLevel(out.level, verdict.level);
    if (next === out.level) continue;
    out = {
      ...out,
      level: next,
      referral: next === "D",
      generationAllowed: out.generationAllowed && next === "B",
      reasons: [...out.reasons, ...(verdict.reasons ?? [`raised_by:${c.id}`])],
      decidedBy: out.decidedBy.startsWith("rules+") ? `${out.decidedBy}+${c.id}` : `rules+${c.id}`,
    };
    if (next === "D") out.intent = "personal-case";
  }
  return out;
}

export async function routeQuestion(question: string, opts: RouteOptions & { classifiers?: SafetyClassifier[] } = {}): Promise<RouteDecision> {
  return applyClassifiers(routeDeterministic(question, opts), question, opts.classifiers);
}
