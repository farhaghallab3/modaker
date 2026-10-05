/**
 * The grounded assistant pipeline.
 *
 *   guard ─┬─ fatwa ─────────→ needs-scholar (fixed text) [+ related tafsir citations]
 *          ├─ off-topic ─────→ insufficient (polite redirect)
 *          ├─ quran-text ────→ verses from QuranProvider (no LLM)
 *          ├─ quiz ──────────→ quiz from verified verses (no LLM)
 *          └─ explain/story/word-meaning/general
 *                 → references → retrieve (approved sources)
 *                 → 0 passages → insufficient
 *                 → LLM (strict prompt) → sanitize → citations   | or extractive quoting
 *   QuranSourceUnavailableError anywhere → unavailable
 *
 * Dependencies are injectable so the whole pipeline is testable without network.
 */
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { AssistantAnswer, Ayah, AyahRange, Citation } from "@/lib/types";
import { QuranSourceUnavailableError, QuranVerificationError } from "../errors";
import type { LLMProvider } from "../llm/provider";
import type { QuranProvider, TafsirSlug } from "../quran/common";
import { classifyQuestion, NEEDS_SCHOLAR_TEXT, OFF_TOPIC_TEXT, type QuestionKind } from "./guard";
import { buildUserMessage, INSUFFICIENT_SENTINEL, passageLabel, SYSTEM_PROMPT } from "./prompt";
import { buildQuiz } from "./quiz";
import { parseReferences, rangeSize, type ParsedReferences, type ReferenceContext } from "./references";
import { ayahRefLabel, quranComUrl, TafsirRetriever, type Passage, type Retriever } from "./retriever";
import { sanitizeLlmOutput, usedCitationNumbers } from "./sanitize";
import { getSource } from "./sources";

export interface AskInput {
  question: string;
  context?: ReferenceContext;
}

export interface AssistantDeps {
  quran: QuranProvider;
  retriever: Retriever;
  llm: LLMProvider | null;
  tafsir?: TafsirSlug;
  random?: () => number;
}

export interface AssistantResult extends AssistantAnswer {
  /** Diagnostics for logging (not part of the public contract). */
  meta?: { questionKind: QuestionKind; refs: ParsedReferences; passages: number };
}

const ATTACH_VERSES_MAX = 5;
const QURAN_TEXT_MAX = 20;
const PASSAGE_LIMIT = 6;
const EXTRACTIVE_TOP = 3;

export const MESSAGES = {
  insufficient:
    "لم أجد في المصادر المعتمدة لديّ ما يكفي للإجابة عن هذا السؤال بدقّة، ولا أحبّ أن أقول في كتاب الله بغير علم. جرّب ذكر اسم السورة ورقم الآية، أو اسأل أهل العلم.",
  unavailable: "تعذّر الوصول إلى مصدر النصوص الموثّق الآن، فلم أستطع الإجابة. حاول مرة أخرى بعد قليل.",
  needsRef: "حدّد السورة ورقم الآية حتى أعرض لك النص من المصحف الموثّق، مثل: «اعرض الآية ٥ من سورة الملك».",
  quizNeedsSurah: "اختر سورة أولًا ثم اطلب الاختبار، مثل: «اختبرني في سورة الملك»، أو افتح السورة في صفحة الحفظ واطلبه من هناك.",
  relatedSources: "ويمكنك الاطلاع على التفسير المعتمد للآيات المذكورة في المصادر المرفقة.",
  extractiveIntro: "إليك ما ورد في المصادر المعتمدة حول سؤالك:",
};

// ── helpers ──────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.7 ? lastSpace : max)}…`;
}

export function passageCitation(p: Passage): Citation {
  const src = getSource(p.sourceId);
  return {
    sourceId: p.sourceId,
    title: src?.title ?? p.sourceId,
    ref: src?.editorial ? `${p.ref} (مقدمة تحريرية)` : `${src?.title ?? p.sourceId} — ${p.ref}`,
    excerpt: truncate(p.text, 240),
    url: p.url ?? src?.url,
  };
}

function quranCitation(source: { id: string; title: string; url?: string }, ranges: AyahRange[]): Citation {
  const ref = ranges.map((r) => ayahRefLabel(r.surah, r.from, r.to)).join("، ");
  const first = ranges[0];
  return {
    sourceId: source.id,
    title: source.title,
    ref,
    excerpt: "النص كما ورد في المصحف من مصدر موثّق (رواية حفص عن عاصم).",
    url: first ? quranComUrl(first.surah, first.from) : source.url,
  };
}

async function loadVerses(quran: QuranProvider, ranges: AyahRange[], max: number): Promise<Ayah[]> {
  const out: Ayah[] = [];
  for (const r of ranges) {
    if (out.length >= max) break;
    const to = Math.min(r.to, r.from + (max - out.length) - 1);
    out.push(...(await quran.getAyahs({ surah: r.surah, from: r.from, to })));
  }
  return out;
}

/** Re-number [n] markers to follow the order of the citations we return. */
function renumber(text: string, mapping: Map<number, number>): string {
  return text.replace(/\[(\d{1,2})\]/g, (m, d) => {
    const k = mapping.get(Number(d));
    return k ? `[${k}]` : "";
  });
}

// ── pipeline ─────────────────────────────────────────────────────────────

export function createAssistant(deps: AssistantDeps) {
  const random = deps.random ?? Math.random;

  async function answer({ question, context }: AskInput): Promise<AssistantResult> {
    const q = question.trim();
    const questionKind = classifyQuestion(q);
    const refs = parseReferences(q, context);
    const meta = { questionKind, refs, passages: 0 };
    const base = { meta } as const;

    try {
      switch (questionKind) {
        case "fatwa":
          return { ...base, ...(await needsScholar(refs)) };
        case "off-topic":
          return { ...base, kind: "insufficient", text: OFF_TOPIC_TEXT, citations: [], provider: "guard" };
        case "quran-text":
          return { ...base, ...(await quranText(refs)) };
        case "quiz":
          return { ...base, ...(await quiz(refs)) };
        default:
          break;
      }

      const passages = await deps.retriever.retrieve(q, { refs, limit: PASSAGE_LIMIT });
      meta.passages = passages.length;

      // Verses for referenced ayahs: attach when small; also used to sanitize LLM output.
      const size = rangeSize(refs.ranges);
      const verses = refs.ranges.length ? await loadVerses(deps.quran, refs.ranges, Math.min(size, QURAN_TEXT_MAX)) : [];
      const attach = verses.length && size <= ATTACH_VERSES_MAX ? verses : undefined;

      if (!passages.length) {
        return { ...base, kind: "insufficient", text: MESSAGES.insufficient, citations: [], verses: attach, provider: "retrieval" };
      }

      if (deps.llm) {
        try {
          return { ...base, ...(await generate(q, questionKind, passages, verses, attach, deps.llm)) };
        } catch (e) {
          // Vendor outage → degrade to extractive quoting rather than failing.
          console.warn("[assistant] LLM failed, falling back to extractive:", (e as Error).message);
        }
      }
      return { ...base, ...extractive(passages, attach) };
    } catch (e) {
      if (e instanceof QuranSourceUnavailableError || e instanceof QuranVerificationError) {
        return { ...base, kind: "unavailable", text: MESSAGES.unavailable, citations: [], provider: "quran-source" };
      }
      throw e;
    }
  }

  async function needsScholar(refs: ParsedReferences): Promise<AssistantAnswer> {
    // Offer related sources only for explicitly referenced ayahs; never generate.
    let citations: Citation[] = [];
    let verses: Ayah[] | undefined;
    if (refs.ranges.length) {
      try {
        const tafsir = new TafsirRetriever(deps.quran, deps.tafsir ?? "muyassar", ATTACH_VERSES_MAX);
        citations = (await tafsir.retrieve("", { refs, limit: 3 })).slice(0, 3).map(passageCitation);
        if (rangeSize(refs.ranges) <= ATTACH_VERSES_MAX) verses = await loadVerses(deps.quran, refs.ranges, ATTACH_VERSES_MAX);
      } catch {
        citations = [];
      }
    }
    const text = citations.length ? `${NEEDS_SCHOLAR_TEXT}\n${MESSAGES.relatedSources}` : NEEDS_SCHOLAR_TEXT;
    return { kind: "needs-scholar", text, citations, verses, provider: "guard" };
  }

  async function quranText(refs: ParsedReferences): Promise<AssistantAnswer> {
    let ranges = refs.ranges;
    if (!ranges.length && refs.surahs.length) {
      const m = getSurahMeta(refs.surahs[0])!;
      if (m.ayahCount <= QURAN_TEXT_MAX) ranges = [{ surah: m.number, from: 1, to: m.ayahCount }];
    }
    if (!ranges.length) return { kind: "insufficient", text: MESSAGES.needsRef, citations: [], provider: "quran-provider" };

    const verses = await loadVerses(deps.quran, ranges, QURAN_TEXT_MAX);
    const shown: AyahRange[] = [];
    for (const v of verses) {
      const last = shown[shown.length - 1];
      if (last && last.surah === v.surah && last.to === v.ayah - 1) last.to = v.ayah;
      else shown.push({ surah: v.surah, from: v.ayah, to: v.ayah });
    }
    const label = shown.map((r) => `سورة ${ayahRefLabel(r.surah, r.from, r.to)}`).join("، ");
    const truncated = rangeSize(ranges) > verses.length ? `\n(عُرضت أول ${toArabicDigits(QURAN_TEXT_MAX)} آية فقط.)` : "";
    const source = (await deps.quran.getSurah(verses[0].surah)).source;
    return {
      kind: "quran-text",
      text: `هذا نص ${label} من المصحف الموثّق.${truncated}`,
      verses,
      citations: [quranCitation(source, shown)],
      provider: `quran:${deps.quran.id}`,
    };
  }

  async function quiz(refs: ParsedReferences): Promise<AssistantAnswer> {
    const surah = refs.ranges[0]?.surah ?? refs.surahs[0];
    if (!surah) return { kind: "insufficient", text: MESSAGES.quizNeedsSurah, citations: [], provider: "quiz" };
    const text = await deps.quran.getSurah(surah);
    const inRanges = refs.ranges.filter((r) => r.surah === surah);
    // A single context ayah is too narrow for a quiz — use the whole surah then.
    const candidates =
      inRanges.length && rangeSize(inRanges) >= 3
        ? text.ayahs.filter((a) => inRanges.some((r) => a.ayah >= r.from && a.ayah <= r.to))
        : text.ayahs;
    const built = buildQuiz(text.meta, candidates, 3, random);
    if (!built) return { kind: "insufficient", text: MESSAGES.quizNeedsSurah, citations: [], provider: "quiz" };
    const ranges = built.verses.map((v) => ({ surah, from: v.ayah, to: v.ayah }));
    return {
      kind: "quran-text",
      text: built.text,
      verses: built.verses,
      citations: [quranCitation(text.source, ranges)],
      provider: `quiz:${deps.quran.id}`,
    };
  }

  async function generate(
    question: string,
    kind: QuestionKind,
    passages: Passage[],
    verses: Ayah[],
    attach: Ayah[] | undefined,
    llm: LLMProvider,
  ): Promise<AssistantAnswer> {
    const { content, used } = buildUserMessage(question, passages, kind);
    const raw = await llm.complete({ system: SYSTEM_PROMPT, messages: [{ role: "user", content }], maxTokens: 700, temperature: 0.2 });

    if (!raw || raw.includes(INSUFFICIENT_SENTINEL)) {
      // Still show what was consulted so the user can read the sources directly.
      return {
        kind: "insufficient",
        text: MESSAGES.insufficient,
        citations: used.slice(0, EXTRACTIVE_TOP).map(passageCitation),
        verses: attach,
        provider: llm.id,
      };
    }

    const { text: clean } = sanitizeLlmOutput(raw, { knownVerses: verses.map((v) => v.textUthmani) });
    const numbers = usedCitationNumbers(clean, used.length);
    const chosen = numbers.length ? numbers : used.slice(0, Math.min(EXTRACTIVE_TOP, used.length)).map((_, i) => i + 1);
    const mapping = new Map(chosen.map((oldN, i) => [oldN, i + 1]));
    const text = renumber(clean, mapping).trim();

    if (!text) {
      return { ...extractive(passages, attach) };
    }
    return {
      kind: "grounded",
      text,
      citations: chosen.map((k) => passageCitation(used[k - 1])),
      verses: attach,
      provider: llm.id,
    };
  }

  /** No LLM: introduce and quote the top passages verbatim with their sources. */
  function extractive(passages: Passage[], attach: Ayah[] | undefined): AssistantAnswer {
    const top = passages.slice(0, EXTRACTIVE_TOP);
    const body = top.map((p, i) => `[${i + 1}] ${passageLabel(p)}:\n«${truncate(p.text, 700)}»`).join("\n\n");
    return {
      kind: "grounded",
      text: `${MESSAGES.extractiveIntro}\n\n${body}`,
      citations: top.map(passageCitation),
      verses: attach,
      provider: "extractive",
    };
  }

  return { answer };
}

/** Default wiring from environment (lazy imports keep this module testable). */
export async function answerQuestion(input: AskInput): Promise<AssistantAnswer> {
  const [{ getQuranProvider }, { getLlmProvider, getEmbeddingProvider }, { hasDatabase }, retrievers] = await Promise.all([
    import("../quran/provider"),
    import("../llm/provider"),
    import("../db"),
    import("./retriever"),
  ]);
  const quran = getQuranProvider();
  const parts: Retriever[] = [new retrievers.TafsirRetriever(quran, "muyassar")];
  const embedder = getEmbeddingProvider();
  if (hasDatabase() && embedder) parts.push(new retrievers.PgVectorRetriever(embedder));
  const assistant = createAssistant({ quran, retriever: new retrievers.HybridRetriever(parts), llm: getLlmProvider() });
  const { meta, ...answer } = await assistant.answer(input);
  void meta;
  return answer;
}
