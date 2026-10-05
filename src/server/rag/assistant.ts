/**
 * The grounded assistant pipeline.
 *
 *   route (safety level A–D + intent + flags)            ← src/server/safety/router.ts
 *     ├─ D  personal fatwa / case ─→ neutral referral (+ related approved passages) — no ruling
 *     ├─ non-Arabic ──────────────→ abstain (no reviewed material in that language yet)
 *     ├─ off-topic ───────────────→ scope redirect
 *     ├─ hadith request ──────────→ HadithProvider; with no approved hadith source → abstain
 *     ├─ quran-text / quiz ───────→ verses from the QuranProvider (no LLM)  [Level A]
 *     └─ explain / story / word / general  [Level B, or C when disputed/sensitive]
 *          quote check  → misquoted ayah is corrected from the verified text (or: ask to clarify)
 *          retrieve     → approved + published passages only
 *          weak/no evidence → abstain: «لا تتوفر لدي مادة موثوقة كافية…»
 *          C → conservative preface + sourced passages, no generation, no ruling
 *          B → extractive quoting, or (only if explicitly enabled) generation that must pass the
 *              verifier: valid citations on every sentence, quotes verbatim, no invented hadith
 *   QuranSourceUnavailableError anywhere → unavailable
 *
 * Every answer carries the safety envelope: level, answer type, typed blocks, citation list,
 * whether generation was allowed/used, abstention reason, referral flag, AI disclosure.
 * Dependencies are injectable so the whole pipeline is testable without network.
 */
import { AI_DISCLOSURE } from "@/lib/brand";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { AbstainReason, AnswerBlock, AnswerKind, AnswerType, AssistantAnswer, Ayah, AyahRange, Citation } from "@/lib/types";
import { QuranSourceUnavailableError, QuranVerificationError } from "../errors";
import type { LLMProvider } from "../llm/provider";
import type { QuranProvider, TafsirSlug } from "../quran/common";
import { filterCitations, verifyGeneratedAnswer, type VerifyIssue } from "../safety/answer-verifier";
import { NO_HADITH_PROVIDER, type HadithProvider } from "../safety/hadith";
import type { QuoteMatch, QuranQuoteIndex } from "../safety/quote-verifier";
import { applyClassifiers, routeDeterministic, type Intent, type RouteDecision, type SafetyClassifier } from "../safety/router";
import { TEMPLATES } from "../safety/templates";
import { buildUserMessage, INSUFFICIENT_SENTINEL, passageLabel, SYSTEM_PROMPT } from "./prompt";
import { buildQuiz } from "./quiz";
import { parseReferences, rangeSize, type ParsedReferences, type ReferenceContext } from "./references";
import { ayahRefLabel, quranComUrl, TafsirRetriever, type Passage, type Retriever } from "./retriever";
import { getSource, isApproved } from "./sources";

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
  /** Explicit opt-in (ASSISTANT_GENERATION=on). A configured `llm` alone never enables generation. */
  generationEnabled?: boolean;
  /** Extra classifiers; they may only raise the safety level. */
  classifiers?: SafetyClassifier[];
  /** Lazy provider of the verified-Quran quotation index. Omit to skip quotation checks. */
  quoteIndex?: () => Promise<QuranQuoteIndex>;
  hadith?: HadithProvider;
}

export interface AssistantResult extends AssistantAnswer {
  /** Diagnostics for logging (not part of the public contract). */
  meta?: { decision: RouteDecision; refs: ParsedReferences; passages: number; issues: VerifyIssue[] };
}

const ATTACH_VERSES_MAX = 5;
const QURAN_TEXT_MAX = 20;
const PASSAGE_LIMIT = 6;
const EXTRACTIVE_TOP = 3;
/** A passage must score at least this to count as evidence. Direct ayah hits score 1. */
export const EVIDENCE_THRESHOLD = 0.4;

/** Kept for existing imports; the wording itself lives in src/server/safety/templates.ts. */
export const MESSAGES = {
  insufficient: TEMPLATES.abstain.text,
  unavailable: TEMPLATES.unavailable.text,
  needsRef: TEMPLATES.needsRef.text,
  quizNeedsSurah: TEMPLATES.quizNeedsSurah.text,
  relatedSources: TEMPLATES.relatedSources.text,
  extractiveIntro: TEMPLATES.extractiveIntro.text,
};

// ── helpers ──────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.7 ? lastSpace : max)}…`;
}

const KIND_MAP: Record<string, NonNullable<Citation["sourceKind"]>> = {
  quran: "quran",
  tafsir: "tafsir",
  hadith: "hadith",
  translation: "translation",
  curated: "curated",
};

export function passageCitation(p: Passage): Citation {
  const src = getSource(p.sourceId);
  return {
    sourceId: p.sourceId,
    title: src?.title ?? p.sourceId,
    ref: src?.editorial ? `${p.ref} (مقدمة تحريرية)` : `${src?.title ?? p.sourceId} — ${p.ref}`,
    excerpt: truncate(p.text, 240),
    url: p.url ?? src?.url,
    sourceKind: KIND_MAP[p.kind ?? src?.kind ?? ""] ?? "other",
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
    sourceKind: "quran",
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

function groupRanges(verses: Ayah[]): AyahRange[] {
  const shown: AyahRange[] = [];
  for (const v of verses) {
    const last = shown[shown.length - 1];
    if (last && last.surah === v.surah && last.to === v.ayah - 1) last.to = v.ayah;
    else shown.push({ surah: v.surah, from: v.ayah, to: v.ayah });
  }
  return shown;
}

const KIND_FOR: Record<AnswerType, AnswerKind> = {
  quran_text: "quran-text",
  quiz: "quran-text",
  quote_correction: "quran-text",
  sourced_explanation: "grounded",
  sensitive_sourced: "grounded",
  referral: "needs-scholar",
  abstention: "insufficient",
  clarification: "insufficient",
  scope_redirect: "insufficient",
  unavailable: "unavailable",
};

interface Parts {
  type: AnswerType;
  text: string;
  provider: string;
  kind?: AnswerKind;
  citations?: Citation[];
  verses?: Ayah[];
  blocks?: AnswerBlock[];
  abstain?: AbstainReason;
  generationUsed?: boolean;
}

// ── pipeline ─────────────────────────────────────────────────────────────

export function createAssistant(deps: AssistantDeps) {
  const random = deps.random ?? Math.random;
  const hadith = deps.hadith ?? NO_HADITH_PROVIDER;
  const generationEnabled = Boolean(deps.generationEnabled && deps.llm);

  async function answer({ question, context }: AskInput): Promise<AssistantResult> {
    const q = question.trim();
    let decision = routeDeterministic(q, { generationEnabled });
    decision = await applyClassifiers(decision, q, deps.classifiers);
    // References come from the ORIGINAL text: cleaning for routing normalises away "1-3" and "19:32".
    let refs = parseReferences(q, context);
    const meta = { decision, refs, passages: 0, issues: [] as VerifyIssue[] };

    const finish = (p: Parts): AssistantResult => {
      const citations = p.citations ?? [];
      const blocks: AnswerBlock[] = [...(p.blocks ?? [])];
      if (!blocks.some((b) => b.type === "citation")) {
        citations.forEach((c, i) =>
          blocks.push({ type: "citation", n: i + 1, sourceId: c.sourceId, title: c.title, ref: c.ref, url: c.url, sourceKind: c.sourceKind }),
        );
      }
      return {
        kind: p.kind ?? KIND_FOR[p.type],
        text: p.text,
        verses: p.verses,
        citations,
        provider: p.provider,
        safetyLevel: decision.level,
        answerType: p.type,
        blocks,
        generation: { allowed: decision.generationAllowed, used: Boolean(p.generationUsed) },
        abstained: Boolean(p.abstain),
        abstainReason: p.abstain,
        referral: decision.referral || p.type === "referral",
        disclosure: AI_DISCLOSURE,
        meta: { ...meta, refs },
      };
    };

    // Notices that precede any answer: manipulation attempts and hostile tone.
    const preTexts: string[] = [];
    const preBlocks: AnswerBlock[] = [];
    if (decision.flags.injection) {
      preTexts.push(TEMPLATES.injection.text);
      preBlocks.push({ type: "warning", text: TEMPLATES.injection.text, code: "injection", templateId: TEMPLATES.injection.id, templateVersion: TEMPLATES.injection.version });
    }
    if (decision.flags.hostile) {
      preTexts.push(TEMPLATES.hostile.text);
      preBlocks.push({ type: "explanation", text: TEMPLATES.hostile.text, origin: "template", citations: [] });
    }
    const compose = (...parts: (string | undefined)[]) => [...preTexts, ...parts].filter(Boolean).join("\n\n");

    const abstain = (requested: AbstainReason, over: Partial<Parts> = {}): AssistantResult => {
      // A recognised fiqh question with no approved fiqh source is a KNOWLEDGE GAP, not a generic miss:
      // say so plainly (the limit is our knowledge base) and record it as its own abstention reason.
      const fiqhGap = requested === "no_evidence" && decision.level === "C" && decision.flags.rulingRequest;
      const reason: AbstainReason = fiqhGap ? "no_fiqh_source" : requested;
      const bodies: Record<AbstainReason, string> = {
        no_evidence: TEMPLATES.abstain.text,
        no_fiqh_source: TEMPLATES.fiqhNoMaterial.text,
        no_hadith_source: `${TEMPLATES.abstain.text} ${TEMPLATES.noHadithSource.text}`,
        language_unsupported: TEMPLATES.language.text,
        unverified_generation: TEMPLATES.abstain.text,
        needs_clarification: TEMPLATES.quoteClarify.text,
        out_of_scope: TEMPLATES.scope.text,
        policy: TEMPLATES.scope.text,
        source_unavailable: TEMPLATES.unavailable.text,
      };
      const sensitive = decision.level === "C" && reason !== "out_of_scope" && reason !== "language_unsupported" && reason !== "no_fiqh_source";
      const blocks: AnswerBlock[] = [...preBlocks];
      if (sensitive) blocks.push({ type: "warning", text: TEMPLATES.sensitiveCNoMaterial.text, code: "sensitive", templateId: TEMPLATES.sensitiveCNoMaterial.id, templateVersion: TEMPLATES.sensitiveCNoMaterial.version });
      if (reason === "no_fiqh_source") {
        blocks.push({ type: "warning", text: TEMPLATES.fiqhNoMaterial.text, code: "sensitive", templateId: TEMPLATES.fiqhNoMaterial.id, templateVersion: TEMPLATES.fiqhNoMaterial.version });
      } else {
        blocks.push({ type: "explanation", text: bodies[reason], origin: "template", citations: [] });
      }
      if (over.blocks) blocks.push(...over.blocks);
      return finish({
        type: reason === "out_of_scope" || reason === "policy" ? "scope_redirect" : reason === "needs_clarification" ? "clarification" : "abstention",
        text: compose(sensitive ? TEMPLATES.sensitiveCNoMaterial.text : undefined, bodies[reason]),
        provider: over.provider ?? "abstain",
        abstain: reason,
        citations: over.citations,
        verses: over.verses,
        blocks,
      });
    };

    try {
      // ── Level D: personal fatwa / case ──────────────────────────────────
      if (decision.level === "D") return await referral();

      // ── scope / language ────────────────────────────────────────────────
      if (decision.intent === "off-topic") return abstain(decision.flags.injection ? "policy" : "out_of_scope", { provider: "guard" });
      if (decision.intent === "non-arabic") return abstain("language_unsupported", { provider: "guard" });

      // ── hadith: never from memory ───────────────────────────────────────
      if (decision.intent === "hadith-request") {
        if (!hadith.available) return abstain("no_hadith_source", { provider: "hadith:none" });
        const found = await hadith.find(decision.cleanedQuestion);
        if (!found.length) return abstain("no_hadith_source", { provider: `hadith:${hadith.id}` });
        const citations: Citation[] = found.map((h) => ({ sourceId: h.sourceId, title: h.reference, ref: h.reference, excerpt: truncate(h.text, 240), sourceKind: "hadith" }));
        return finish({
          type: "sourced_explanation",
          text: compose(found.map((h) => `${h.text}\n(${h.reference} — ${h.grade})`).join("\n\n")),
          provider: `hadith:${hadith.id}`,
          citations,
          blocks: [...preBlocks, ...found],
        });
      }

      // ── deterministic Quran intents (Level A) ───────────────────────────
      if (decision.intent === "quran-text") return await quranText();
      if (decision.intent === "quiz") return await quiz();

      // ── quotation check: never reason over a corrupted ayah ─────────────
      let correction: { text: string; blocks: AnswerBlock[]; verses: Ayah[]; citation: Citation } | null = null;
      const quote = await checkQuote(q);
      if (quote?.status === "ambiguous") return await clarify(quote.candidates);
      if (quote?.status === "corrected") {
        const m = quote.match;
        const verses = m.verses;
        const source = (await deps.quran.getSurah(m.surah)).source;
        const citation = quranCitation(source, [{ surah: m.surah, from: m.from, to: m.to }]);
        const text = `${TEMPLATES.quoteCorrection.text}\n(${ayahRefLabel(m.surah, m.from, m.to)})`;
        correction = {
          text,
          verses,
          citation,
          blocks: [
            { type: "warning", text: TEMPLATES.quoteCorrection.text, code: "quote_mismatch", templateId: TEMPLATES.quoteCorrection.id, templateVersion: TEMPLATES.quoteCorrection.version },
            { type: "quran", verses, source, caption: ayahRefLabel(m.surah, m.from, m.to) },
          ],
        };
        // Continue only for explanatory questions, and only about the VERIFIED ayah.
        if (decision.intent === "explain" || decision.intent === "word-meaning" || decision.intent === "story") {
          refs = { surahs: [m.surah], ranges: [{ surah: m.surah, from: m.from, to: m.to }], fromContext: false };
          // From here on the question is about the VERIFIED ayah only: the user's corrupted wording is
          // never sent to retrieval or to a model.
          const where = m.from === m.to ? `الآية ${toArabicDigits(m.from)}` : `الآيات ${toArabicDigits(m.from)}–${toArabicDigits(m.to)}`;
          decision = { ...decision, cleanedQuestion: `ما معنى ${where} من سورة ${getSurahMeta(m.surah)?.nameAr ?? m.surah}` };
        } else {
          return finish({
            type: "quote_correction",
            text: compose(text),
            provider: "quote-verifier",
            verses,
            citations: [citation],
            blocks: [...preBlocks, ...correction.blocks],
          });
        }
      } else if (quote?.status === "exact" && !refs.ranges.length && quote.match.to - quote.match.from < ATTACH_VERSES_MAX) {
        refs = { surahs: [quote.match.surah], ranges: [{ surah: quote.match.surah, from: quote.match.from, to: quote.match.to }], fromContext: false };
      }

      // ── grounded path (Level B, or C) ───────────────────────────────────
      const grounded = await groundedAnswer(refs, decision, preTexts, preBlocks);
      if (!correction) return grounded;
      // Prepend the correction so the user sees the verified text before the explanation.
      const citations = [correction.citation, ...grounded.citations];
      const shift = (t: string) => t.replace(/\[(\d{1,2})\]/g, (_m, d) => `[${Number(d) + 1}]`);
      return finish({
        type: "quote_correction",
        kind: grounded.kind,
        text: `${correction.text}\n\n${TEMPLATES.quoteContinue.text}\n\n${shift(grounded.text)}`,
        provider: grounded.provider,
        verses: correction.verses,
        citations,
        abstain: grounded.abstained ? grounded.abstainReason : undefined,
        generationUsed: grounded.generation?.used,
        blocks: [
          ...preBlocks,
          ...correction.blocks,
          ...(grounded.blocks ?? []).filter((b) => b.type !== "citation" && !preBlocks.includes(b)).map(shiftBlock),
        ],
      });
    } catch (e) {
      if (e instanceof QuranSourceUnavailableError || e instanceof QuranVerificationError) {
        return finish({ type: "unavailable", text: TEMPLATES.unavailable.text, provider: "quran-source", abstain: "source_unavailable" });
      }
      throw e;
    }

    // ── flows ─────────────────────────────────────────────────────────────

    async function checkQuote(text: string) {
      if (!deps.quoteIndex || tokenCount(text) < 4) return null;
      const index = await deps.quoteIndex();
      return index.check(text);
    }

    async function clarify(candidates: QuoteMatch[]): Promise<AssistantResult> {
      const verses = candidates.flatMap((c) => c.verses).slice(0, 6);
      const citations: Citation[] = [];
      for (const c of candidates) {
        const source = (await deps.quran.getSurah(c.surah)).source;
        citations.push(quranCitation(source, [{ surah: c.surah, from: c.from, to: c.to }]));
      }
      return abstain("needs_clarification", {
        provider: "quote-verifier",
        verses,
        citations,
        blocks: candidates.map((c) => ({ type: "quran" as const, verses: c.verses, source: { id: citations[0].sourceId, title: citations[0].title }, caption: ayahRefLabel(c.surah, c.from, c.to) })),
      });
    }

    async function referral(): Promise<AssistantResult> {
      // Offer related approved material only for explicitly referenced ayahs; never rule.
      let citations: Citation[] = [];
      let verses: Ayah[] | undefined;
      const blocks: AnswerBlock[] = [...preBlocks, { type: "referral", text: TEMPLATES.referralD.text, templateId: TEMPLATES.referralD.id, templateVersion: TEMPLATES.referralD.version }];
      if (refs.ranges.length) {
        try {
          const tafsir = new TafsirRetriever(deps.quran, deps.tafsir ?? "muyassar", ATTACH_VERSES_MAX);
          const passages = (await tafsir.retrieve("", { refs, limit: 3 })).slice(0, 3);
          citations = passages.map(passageCitation);
          passages.forEach((p, i) => blocks.push({ type: "source_quote", text: truncate(p.text, 400), sourceId: p.sourceId, ref: p.ref, author: p.author, citation: i + 1 }));
          if (rangeSize(refs.ranges) <= ATTACH_VERSES_MAX) {
            verses = await loadVerses(deps.quran, refs.ranges, ATTACH_VERSES_MAX);
            const source = (await deps.quran.getSurah(refs.ranges[0].surah)).source;
            if (verses.length) blocks.push({ type: "quran", verses, source });
          }
        } catch {
          citations = [];
        }
      }
      return finish({
        type: "referral",
        text: compose(TEMPLATES.referralD.text, citations.length ? TEMPLATES.relatedSources.text : undefined),
        provider: "guard",
        citations,
        verses,
        blocks,
      });
    }

    async function quranText(): Promise<AssistantResult> {
      let ranges = refs.ranges;
      if (!ranges.length && refs.surahs.length) {
        const m = getSurahMeta(refs.surahs[0])!;
        if (m.ayahCount <= QURAN_TEXT_MAX) ranges = [{ surah: m.number, from: 1, to: m.ayahCount }];
      }
      if (!ranges.length) {
        return finish({
          type: "clarification",
          text: compose(TEMPLATES.needsRef.text),
          provider: "quran-provider",
          abstain: "needs_clarification",
          blocks: [...preBlocks, { type: "explanation", text: TEMPLATES.needsRef.text, origin: "template", citations: [] }],
        });
      }
      const verses = await loadVerses(deps.quran, ranges, QURAN_TEXT_MAX);
      const shown = groupRanges(verses);
      const label = shown.map((r) => `سورة ${ayahRefLabel(r.surah, r.from, r.to)}`).join("، ");
      const truncated = rangeSize(ranges) > verses.length ? `\n(عُرضت أول ${toArabicDigits(QURAN_TEXT_MAX)} آية فقط.)` : "";
      const source = (await deps.quran.getSurah(verses[0].surah)).source;
      return finish({
        type: "quran_text",
        text: compose(`هذا نص ${label} من المصحف الموثّق.${truncated}`),
        verses,
        citations: [quranCitation(source, shown)],
        provider: `quran:${deps.quran.id}`,
        blocks: [...preBlocks, { type: "quran", verses, source }],
      });
    }

    async function quiz(): Promise<AssistantResult> {
      const surah = refs.ranges[0]?.surah ?? refs.surahs[0];
      if (!surah) return finish({ type: "clarification", text: compose(TEMPLATES.quizNeedsSurah.text), provider: "quiz", abstain: "needs_clarification" });
      const text = await deps.quran.getSurah(surah);
      const inRanges = refs.ranges.filter((r) => r.surah === surah);
      // A single context ayah is too narrow for a quiz — use the whole surah then.
      const candidates =
        inRanges.length && rangeSize(inRanges) >= 3 ? text.ayahs.filter((a) => inRanges.some((r) => a.ayah >= r.from && a.ayah <= r.to)) : text.ayahs;
      const built = buildQuiz(text.meta, candidates, 3, random);
      if (!built) return finish({ type: "clarification", text: compose(TEMPLATES.quizNeedsSurah.text), provider: "quiz", abstain: "needs_clarification" });
      const ranges = built.verses.map((v) => ({ surah, from: v.ayah, to: v.ayah }));
      return finish({
        type: "quiz",
        text: compose(built.text),
        verses: built.verses,
        citations: [quranCitation(text.source, ranges)],
        provider: `quiz:${deps.quran.id}`,
        blocks: [...preBlocks, { type: "quran", verses: built.verses, source: text.source }],
      });
    }

    async function groundedAnswer(r: ParsedReferences, d: RouteDecision, pre: string[], preB: AnswerBlock[]): Promise<AssistantResult> {
      const passages = await deps.retriever.retrieve(d.cleanedQuestion || q, { refs: r, limit: PASSAGE_LIMIT });
      meta.passages = passages.length;

      const size = rangeSize(r.ranges);
      const verses = r.ranges.length ? await loadVerses(deps.quran, r.ranges, Math.min(size, QURAN_TEXT_MAX)) : [];
      const attach = verses.length && size <= ATTACH_VERSES_MAX ? verses : undefined;
      const sourceOf = async () => (await deps.quran.getSurah(r.ranges[0].surah)).source;
      const quranBlock = async (): Promise<AnswerBlock[]> => (attach?.length ? [{ type: "quran", verses: attach, source: await sourceOf() }] : []);

      // Evidence must clear the threshold, not merely exist.
      const evidence = passages.filter((p) => p.score >= EVIDENCE_THRESHOLD);
      if (!evidence.length) return abstain("no_evidence", { provider: "retrieval", verses: attach, blocks: await quranBlock() });

      const sensitive = d.level === "C";
      const sensitivePreface: AnswerBlock[] = sensitive
        ? [{ type: "warning", text: TEMPLATES.sensitiveC.text, code: "sensitive", templateId: TEMPLATES.sensitiveC.id, templateVersion: TEMPLATES.sensitiveC.version }]
        : [];
      const prefaceText = sensitive ? [TEMPLATES.sensitiveC.text] : [];
      const type: AnswerType = sensitive ? "sensitive_sourced" : "sourced_explanation";

      // Generation: Level B only, explicitly enabled, and the output must survive verification.
      if (d.generationAllowed && deps.llm) {
        try {
          const g = await generate(d, evidence, verses, attach, preB, pre, type);
          if (g) return g;
        } catch (e) {
          console.warn("[assistant] LLM failed, falling back to extractive:", (e as Error).message);
        }
      }
      return finish(await extractive(evidence, attach, type, [...pre, ...prefaceText], [...preB, ...sensitivePreface], await quranBlock()));
    }

    async function generate(
      d: RouteDecision,
      passages: Passage[],
      verses: Ayah[],
      attach: Ayah[] | undefined,
      preB: AnswerBlock[],
      pre: string[],
      type: AnswerType,
    ): Promise<AssistantResult | null> {
      const llm = deps.llm!;
      const { content, used } = buildUserMessage(d.cleanedQuestion || q, passages, d.intent as Intent);
      const raw = await llm.complete({ system: SYSTEM_PROMPT, messages: [{ role: "user", content }], maxTokens: 700, temperature: 0.2 });

      const consulted = used.slice(0, EXTRACTIVE_TOP);
      if (!raw || raw.includes(INSUFFICIENT_SENTINEL)) {
        return abstain("no_evidence", { provider: llm.id, citations: consulted.map(passageCitation), verses: attach });
      }

      const verified = verifyGeneratedAnswer(
        raw,
        used.map((p) => ({ text: p.text, labels: [getSource(p.sourceId)?.title ?? "", getSource(p.sourceId)?.publisher ?? "", p.author ?? ""].filter(Boolean) })),
        verses.map((v) => v.textUthmani),
      );
      meta.issues.push(...verified.issues);
      // Nothing verifiable survived: do not show model text — fall back to quoting the sources.
      if (!verified.supported) return null;

      const chosen = verified.citations;
      const mapping = new Map(chosen.map((oldN, i) => [oldN, i + 1]));
      const text = renumber(verified.text, mapping).trim();
      if (!text) return null;
      const citations = filterCitations(
        chosen.map((k) => passageCitation(used[k - 1])),
        used.map((p) => ({ sourceId: p.sourceId, ref: p.ref })),
        isApproved,
      ).kept;
      const blocks: AnswerBlock[] = [
        ...preB,
        { type: "explanation", text, origin: "generated", citations: citations.map((_, i) => i + 1) },
        ...chosen.map((k, i): AnswerBlock => ({ type: "source_quote", text: truncate(used[k - 1].text, 400), sourceId: used[k - 1].sourceId, ref: used[k - 1].ref, author: used[k - 1].author, citation: i + 1 })),
        ...(attach?.length ? [{ type: "quran" as const, verses: attach, source: (await deps.quran.getSurah(attach[0].surah)).source }] : []),
      ];
      return finish({ type, text: [...pre, text].join("\n\n"), provider: llm.id, citations, verses: attach, blocks, generationUsed: true });
    }

    /** No generation: introduce and quote the top passages verbatim with their sources. */
    async function extractive(
      passages: Passage[],
      attach: Ayah[] | undefined,
      type: AnswerType,
      pre: string[],
      preB: AnswerBlock[],
      quranBlocks: AnswerBlock[],
    ): Promise<Parts> {
      const top = passages.slice(0, EXTRACTIVE_TOP);
      const body = top.map((p, i) => `[${i + 1}] ${passageLabel(p)}:\n«${truncate(p.text, 700)}»`).join("\n\n");
      const citations = filterCitations(top.map(passageCitation), top.map((p) => ({ sourceId: p.sourceId, ref: p.ref })), isApproved).kept;
      return {
        type,
        text: [...pre, `${TEMPLATES.extractiveIntro.text}\n\n${body}`].join("\n\n"),
        provider: "extractive",
        citations,
        verses: attach,
        blocks: [
          ...preB,
          { type: "explanation", text: TEMPLATES.extractiveIntro.text, origin: "extractive", citations: citations.map((_, i) => i + 1) },
          ...top.map((p, i): AnswerBlock => ({ type: "source_quote", text: truncate(p.text, 700), sourceId: p.sourceId, ref: p.ref, author: p.author, citation: i + 1 })),
          ...quranBlocks,
        ],
      };
    }
  }

  return { answer };
}

/** The correction's citation takes slot 1, so every later citation index moves up by one. */
function shiftBlock(b: AnswerBlock): AnswerBlock {
  if (b.type === "source_quote") return { ...b, citation: b.citation + 1 };
  if (b.type === "explanation") return { ...b, citations: b.citations.map((c) => c + 1) };
  return b;
}

function tokenCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[ء-ي]/.test(w)).length;
}

/** Default wiring from environment (lazy imports keep this module testable). */
export async function answerQuestion(input: AskInput): Promise<AssistantAnswer> {
  const [{ getQuranProvider }, { getLlmProvider, getEmbeddingProvider }, { hasDatabase }, retrievers, { env }, { getQuranQuoteIndex }] = await Promise.all([
    import("../quran/provider"),
    import("../llm/provider"),
    import("../db"),
    import("./retriever"),
    import("../env"),
    import("../safety/quran-index"),
  ]);
  const quran = getQuranProvider();
  const parts: Retriever[] = [new retrievers.TafsirRetriever(quran, "muyassar")];
  const embedder = getEmbeddingProvider();
  if (hasDatabase() && embedder) parts.push(new retrievers.PgVectorRetriever(embedder));
  const assistant = createAssistant({
    quran,
    retriever: new retrievers.HybridRetriever(parts),
    llm: getLlmProvider(),
    generationEnabled: env.assistantGeneration(),
    quoteIndex: () => getQuranQuoteIndex(quran),
  });
  const { meta, ...answer } = await assistant.answer(input);
  if (meta?.issues.length) console.warn("[assistant] verifier removed:", meta.issues.map((i) => i.code).join(","));
  return answer;
}
