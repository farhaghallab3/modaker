/**
 * Post-generation verification (runs on EVERY model-written answer before it can be shown).
 *
 * The model is allowed only to summarise the numbered passages it was given. This verifier removes
 * whatever it cannot prove from those passages:
 *
 *   1. verse text            — via sanitizeLlmOutput (Quran text only ever comes from the provider)
 *   2. invalid citations     — a marker [n] that does not point at a passage it was given
 *   3. uncited sentences     — every claim must carry at least one valid citation
 *   4. unsupported quotes    — text in « » must be a verbatim fragment of a retrieved passage
 *   5. fabricated hadith     — hadith attribution (قال رسول الله / رواه البخاري / …) unless the very
 *                              same attribution appears in a retrieved passage
 *   6. unsupported attribution — a named scholar/book that no retrieved passage or source mentions
 *
 * If nothing survives, the caller abstains. Pure and unit-tested.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import { sanitizeLlmOutput, VERSE_PLACEHOLDER } from "../rag/sanitize";

export interface VerifierPassage {
  text: string;
  /** Strings that legitimately name this passage's origin: source title, publisher, author. */
  labels: string[];
}

export type VerifyIssueCode =
  | "verse_text"
  | "invalid_citation"
  | "uncited_sentence"
  | "unsupported_quote"
  | "fabricated_hadith"
  | "unsupported_attribution";

export interface VerifyIssue {
  code: VerifyIssueCode;
  detail: string;
}

export interface VerifyResult {
  text: string;
  issues: VerifyIssue[];
  /** Valid citation numbers that remain in the text, in order of first use. */
  citations: number[];
  /** True when something verifiable remains. */
  supported: boolean;
}

const n = (s: string) => normalizeArabic(s);

const HADITH_ATTRIBUTION = [
  /قال (?:رسول الله|النبي)/g,
  /عن (?:ابي هريره|عايشه|عائشه|ابن عمر|ابن عباس|انس|ابي سعيد|جابر|ابي ذر)/g,
  /رواه (?:البخاري|مسلم|احمد|الترمذي|ابو داود|ابن ماجه|النسائي|مالك|البيهقي|الطبراني)/g,
  /اخرجه [^ ]+/g,
  /صحيح (?:البخاري|مسلم)/g,
  /حديث (?:صحيح|حسن|ضعيف|موضوع)/g,
  /(?:صححه|حسنه|ضعفه) (?:الالباني|ابن حجر|الترمذي|الحاكم)/g,
];

const SCHOLARS = [
  "ابن كثير", "الطبري", "القرطبي", "السعدي", "البغوي", "الزمخشري", "ابن عباس", "مجاهد", "قتاده", "الشافعي", "ابو حنيفه", "ابن تيميه",
  "ابن القيم", "النووي", "ابن حجر", "الالباني", "ابن باز", "ابن عثيمين",
].map(n);

const QUOTED = /«([^»]{1,800})»/g;
const MARKER = /\[(\d{1,2})\]/g;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!؟?\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function verifyGeneratedAnswer(raw: string, passages: VerifierPassage[], knownVerses: string[] = []): VerifyResult {
  const issues: VerifyIssue[] = [];
  const san = sanitizeLlmOutput(raw, { knownVerses });
  if (san.removed) issues.push({ code: "verse_text", detail: `${san.removed} verse-like span(s) replaced` });

  const normPassages = passages.map((p) => n(p.text));
  const normLabels = passages.flatMap((p) => p.labels.map(n));
  const everything = `${normPassages.join(" ")} ${normLabels.join(" ")}`;

  const kept: string[] = [];
  const citations: number[] = [];

  for (let sentence of splitSentences(san.text)) {
    // A bare pointer to the verified verse text carries no claim.
    if (sentence === VERSE_PLACEHOLDER) {
      kept.push(sentence);
      continue;
    }

    // 2. citations must point at a passage the model was actually given
    const here: number[] = [];
    sentence = sentence.replace(MARKER, (m, d) => {
      const k = Number(d);
      if (k >= 1 && k <= passages.length) {
        here.push(k);
        return m;
      }
      issues.push({ code: "invalid_citation", detail: m });
      return "";
    });

    // 3. every claim needs a valid citation
    if (!here.length) {
      issues.push({ code: "uncited_sentence", detail: sentence.slice(0, 60) });
      continue;
    }

    // 4. quotations must be verbatim fragments of the passages cited in this sentence's reach
    let unsupportedQuote = false;
    sentence = sentence.replace(QUOTED, (whole, inner: string) => {
      const q = n(inner);
      if (q && normPassages.some((p) => p.includes(q))) return whole;
      unsupportedQuote = true;
      issues.push({ code: "unsupported_quote", detail: inner.slice(0, 60) });
      return "";
    });
    if (unsupportedQuote && !n(sentence.replace(MARKER, "")).trim()) continue;

    // 5. hadith attribution must appear in the retrieved material itself
    const ns = n(sentence);
    let fabricated = false;
    for (const re of HADITH_ATTRIBUTION) {
      for (const m of ns.matchAll(re)) {
        if (!everything.includes(m[0])) {
          fabricated = true;
          issues.push({ code: "fabricated_hadith", detail: m[0] });
        }
      }
    }
    if (fabricated) continue;

    // 6. named scholars/books must be traceable to the retrieved material
    const stranger = SCHOLARS.find((s) => ns.includes(s) && !everything.includes(s));
    if (stranger) {
      issues.push({ code: "unsupported_attribution", detail: stranger });
      continue;
    }

    for (const k of here) if (!citations.includes(k)) citations.push(k);
    kept.push(sentence.replace(/\s{2,}/g, " ").trim());
  }

  const text = kept.join(" ").trim();
  return { text, issues, citations, supported: citations.length > 0 && text.length > 0 };
}

/**
 * Final guard on an assembled answer: every citation must name a usable source AND correspond to
 * something that was actually retrieved (or to the verified Quran provider). Anything else is
 * removed — a citation can never be invented, only dropped.
 */
export interface CitationLike {
  sourceId: string;
  ref: string;
}

export function filterCitations<T extends CitationLike>(
  citations: T[],
  allowed: { sourceId: string; ref: string }[],
  isUsableSource: (id: string) => boolean,
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const c of citations) {
    const ok = isUsableSource(c.sourceId) && allowed.some((a) => a.sourceId === c.sourceId);
    (ok ? kept : dropped).push(c);
  }
  return { kept, dropped };
}
