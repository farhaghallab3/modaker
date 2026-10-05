/**
 * Recitation comparison: aligns a speech-to-text transcript against the
 * verified expected ayahs and classifies differences.
 *
 * This is TEXT matching only. It can tell whether a word was said, skipped,
 * replaced, added, or said out of order — it cannot judge tajweed (makharij,
 * madd, ghunnah…), which would need an acoustic model. The result is flagged
 * `textOnly: true` and the UI says so.
 */
import { keySimilarity, matchKey, tokenize } from "@/lib/quran/normalize";
import { isConfusablePair, plausibleRecognitionConfusion } from "./confusion";
import type {
  Ayah,
  AyahRange,
  AyahRecitationResult,
  RecitationAnalysis,
  RecitationMistake,
  Transcript,
} from "@/lib/types";

export const FUZZY_OK = 0.75; // kept for reference; word equality is decided by isSameWord below
/**
 * Are these two match keys the same word? Identical keys, or — and ONLY — a long word (≥ 7 letters) of the
 * SAME length differing in exactly ONE letter where that letter pair is acoustically confusable
 * (e.g. «المستقيم»/«المستقين»: م/ن). Nothing else is treated as equal: not a different ending
 * («المستقيمة»), not a different word («الضالين»/«الظالين», «نستعين»/«نستعيذ»), not a short word with a
 * changed letter. Everything else goes to the doubt logic and is reported as uncertain or as a difference.
 */
export const FUZZY_MIN_KEY_LEN = 7;

export function isSameWord(a: string, b: string, _sim?: number): boolean {
  if (a === b) return true;
  if (a.length !== b.length || a.length < FUZZY_MIN_KEY_LEN) return false;
  let diffAt = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (diffAt !== -1) return false; // more than one differing letter
    diffAt = i;
  }
  return diffAt !== -1 && isConfusablePair(a[diffAt], b[diffAt]);
}
const MERGE_OK = 0.88; // stricter: merging/splitting must not swallow an extra word
export const HESITATION_SEC = 3;
/** Below this probability (from the recognizer's own token log-probs) a recognized word is doubtful. */
export const LOW_WORD_CONFIDENCE = 0.5;
/** At or above this the recognizer was confident: a differing word is then not put down to recognition doubt. */
export const HIGH_WORD_CONFIDENCE = 0.85;

export interface ExpTok {
  ayahIdx: number;
  wordIdx: number;
  display: string; // original Uthmani word, for display
  key: string;
}
export interface RecTok {
  idx: number;
  text: string;
  key: string;
  start?: number;
  end?: number;
  /** recognizer's own probability for this word, when it supplied one */
  confidence?: number;
}

export type Op =
  | { t: "match"; e: number[]; r: number[]; sim: number }
  | { t: "sub"; e: number; r: number; sim: number }
  | { t: "del"; e: number }
  | { t: "ins"; r: number };

function splitDisplayWords(text: string): string[] {
  // keep only tokens that survive normalization (drops stray marks like ۚ)
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => tokenize(w).length > 0);
}

export function buildExpected(ayahs: Ayah[]): ExpTok[] {
  const out: ExpTok[] = [];
  ayahs.forEach((a, ayahIdx) => {
    splitDisplayWords(a.textUthmani).forEach((w, wordIdx) => {
      out.push({ ayahIdx, wordIdx, display: w, key: matchKey(w) });
    });
  });
  return out;
}

export function buildRecognized(t: Transcript): RecTok[] {
  if (t.words?.length) {
    const out: RecTok[] = [];
    for (const w of t.words) {
      for (const part of tokenize(w.text)) {
        out.push({ idx: out.length, text: part, key: matchKey(part), start: w.start, end: w.end, confidence: w.confidence });
      }
    }
    return out;
  }
  return tokenize(t.text).map((text, idx) => ({ idx, text, key: matchKey(text) }));
}

/**
 * Weighted edit-distance alignment with two extra moves, because Uthmani and
 * modern word boundaries differ (e.g. one Uthmani word ↔ two spoken words):
 *   merge: 2 recognized → 1 expected     split: 1 recognized → 2 expected
 */
export function align(E: { key: string }[], R: { key: string }[]): Op[] {
  const n = E.length;
  const m = R.length;
  const INF = 1e9;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const back: (Op & { pi: number; pj: number } | null)[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cost[0][0] = 0;

  const subCost = (same: boolean, sim: number) => (same ? (1 - sim) * 0.5 : 1.2 - sim * 0.4);

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c >= INF) continue;
      const relax = (ni: number, nj: number, add: number, op: Op) => {
        if (ni > n || nj > m) return;
        if (c + add < cost[ni][nj]) {
          cost[ni][nj] = c + add;
          back[ni][nj] = { ...op, pi: i, pj: j } as Op & { pi: number; pj: number };
        }
      };
      if (i < n && j < m) {
        const sim = keySimilarity(E[i].key, R[j].key);
        const same = isSameWord(E[i].key, R[j].key, sim);
        relax(i + 1, j + 1, subCost(same, sim), same ? { t: "match", e: [i], r: [j], sim } : { t: "sub", e: i, r: j, sim });
      }
      if (i < n) relax(i + 1, j, 1, { t: "del", e: i });
      if (j < m) relax(i, j + 1, 1, { t: "ins", r: j });
      if (i < n && j + 1 < m) {
        const sim = keySimilarity(E[i].key, R[j].key + R[j + 1].key);
        if (sim >= MERGE_OK) relax(i + 1, j + 2, (1 - sim) * 0.5 + 0.15, { t: "match", e: [i], r: [j, j + 1], sim });
      }
      if (i + 1 < n && j < m) {
        const sim = keySimilarity(E[i].key + E[i + 1].key, R[j].key);
        if (sim >= MERGE_OK) relax(i + 2, j + 1, (1 - sim) * 0.5 + 0.15, { t: "match", e: [i, i + 1], r: [j], sim });
      }
    }
  }

  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (!b) break;
    const { pi, pj, ...op } = b;
    ops.push(op as Op);
    i = pi;
    j = pj;
  }
  return ops.reverse();
}

type WordState = AyahRecitationResult["words"][number];
type Doubt = { reason: NonNullable<WordState["reason"]>; confidence?: number };

interface DoubtContext {
  rangeKeys: Set<string>;
  lowSegments: { start: number; end: number }[];
  /** expected flat index → key of the word the SECOND recognizer heard there (when it heard one) */
  second: Map<number, string> | null;
}

function buildDoubtContext(E: ExpTok[], t: Transcript): DoubtContext {
  const so = t.evidence?.secondOpinion;
  let second: Map<number, string> | null = null;
  if (so && (so.text?.trim() || so.words?.length)) {
    const R2 = buildRecognized({ text: so.text, words: so.words, provider: so.provider, language: t.language });
    second = new Map();
    for (const op of align(E, R2)) {
      if (op.t === "match") second.set(op.e[0], R2[op.r[0]].key);
      else if (op.t === "sub") second.set(op.e, R2[op.r].key);
    }
  }
  return {
    rangeKeys: new Set(E.map((e) => e.key)),
    lowSegments: (t.evidence?.lowConfidenceSegments ?? []).map((s) => ({ start: s.start, end: s.end })),
    second,
  };
}

/**
 * A differing word is only called the learner's mistake if nothing suggests the RECOGNIZER may have
 * misheard. Evidence, strongest first (each only when it really exists):
 *   1. the word is a different word of this very passage → a genuine slip (a swap), not a recognition artefact
 *   2. a second recognizer heard it differently → uncertain; heard the same wrong word → a firmer signal
 *   3. the recognizer's own probability for the word is low, or the word sits in a segment it flagged unreliable
 *   4. no evidence either way: a letter-confusion plausibility check (heuristic, see confusion.ts)
 * Returns null when the difference stands as the learner's.
 */
function doubtFor(eFlat: number, e: ExpTok, h: RecTok, ctx: DoubtContext): Doubt | null {
  if (h.key !== e.key && ctx.rangeKeys.has(h.key)) return null;

  if (ctx.second) {
    const s2 = ctx.second.get(eFlat);
    if (s2 !== undefined) {
      if (isSameWord(s2, e.key)) return { reason: "recognizers-disagree" }; // the other recognizer heard the expected word
      if (isSameWord(s2, h.key)) return null; // both heard the same different word
      return { reason: "recognizers-disagree" }; // they heard different things
    }
  }

  if (h.confidence != null && h.confidence < LOW_WORD_CONFIDENCE) return { reason: "low-confidence", confidence: h.confidence };
  if (h.start != null && ctx.lowSegments.some((s) => (h.start! + (h.end ?? h.start!)) / 2 >= s.start && (h.start! + (h.end ?? h.start!)) / 2 <= s.end)) {
    return { reason: "low-confidence" };
  }
  if (h.confidence != null && h.confidence >= HIGH_WORD_CONFIDENCE) return null; // the recognizer was sure

  return plausibleRecognitionConfusion(e.key, h.key) ? { reason: "confusable" } : null;
}

function substitution(eFlat: number, e: ExpTok, h: RecTok, ctx: DoubtContext): WordState {
  const doubt = doubtFor(eFlat, e, h, ctx);
  if (!doubt) return { text: e.display, state: "incorrect", heard: h.text };
  return { text: e.display, state: "uncertain", heard: h.text, reason: doubt.reason, ...(doubt.confidence != null ? { confidence: Math.round(doubt.confidence * 1000) / 1000 } : {}) };
}

export function analyzeRecitation(
  ayahs: Ayah[],
  transcript: Transcript,
  range: AyahRange,
): RecitationAnalysis {
  const E = buildExpected(ayahs);
  const R = buildRecognized(transcript);
  const ctx = buildDoubtContext(E, transcript);
  const flatIndex = new Map(E.map((t, i) => [t, i]));

  const words: WordState[][] = ayahs.map((a) => splitDisplayWords(a.textUthmani).map((text) => ({ text, state: "omitted" as const })));
  const mistakes: RecitationMistake[] = [];
  const consumed = new Set<number>();
  const rToE = new Map<number, number>(); // recognized idx → expected flat idx (for hesitation attribution)
  const insertions: number[] = [];
  const insertionAnchor = new Map<number, number>(); // r idx → last expected idx before it

  let lastE = -1;
  for (const op of align(E, R)) {
    if (op.t === "match") {
      for (const e of op.e) {
        const tok = E[e];
        words[tok.ayahIdx][tok.wordIdx] = { text: tok.display, state: "ok" };
        lastE = e;
      }
      for (const r of op.r) {
        consumed.add(r);
        rToE.set(r, op.e[0]);
      }
    } else if (op.t === "sub") {
      const tok = E[op.e];
      words[tok.ayahIdx][tok.wordIdx] = substitution(op.e, tok, R[op.r], ctx);
      consumed.add(op.r);
      rToE.set(op.r, op.e);
      lastE = op.e;
    } else if (op.t === "del") {
      lastE = op.e;
    } else {
      insertions.push(op.r);
      insertionAnchor.set(op.r, lastE);
    }
  }

  // ── Out-of-order detection ───────────────────────────────────────────
  // An ayah that came out mostly "omitted" may have been recited elsewhere:
  // look for it inside runs of unmatched recognized words.
  const runs: number[][] = [];
  for (const r of insertions) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === r - 1) last.push(r);
    else runs.push([r]);
  }
  const orderAyahs = new Set<number>();
  ayahs.forEach((_, ai) => {
    const ws = words[ai];
    const okShare = ws.filter((w) => w.state === "ok").length / Math.max(1, ws.length);
    if (ws.length < 2 || okShare >= 0.5) return;
    const expToks = E.filter((t) => t.ayahIdx === ai);
    let best: { run: number[]; ops: Op[]; score: number } | null = null;
    for (const run of runs) {
      const free = run.filter((r) => !consumed.has(r));
      if (free.length < Math.ceil(expToks.length * 0.5)) continue;
      const ops = align(expToks, free.map((r) => R[r]));
      const ok = ops.reduce((s, o) => s + (o.t === "match" ? o.e.length : 0), 0);
      const score = ok / expToks.length;
      if (score >= 0.6 && (!best || score > best.score)) best = { run: free, ops, score };
    }
    if (!best) return;
    orderAyahs.add(ai);
    for (const o of best.ops) {
      if (o.t === "match") {
        for (const e of o.e) words[ai][expToks[e].wordIdx] = { text: expToks[e].display, state: "ok" };
        for (const r of o.r) consumed.add(best.run[r]);
      } else if (o.t === "sub") {
        words[ai][expToks[o.e].wordIdx] = substitution(flatIndex.get(expToks[o.e])!, expToks[o.e], R[best.run[o.r]], ctx);
        consumed.add(best.run[o.r]);
      }
    }
  });

  // ── Mistakes per ayah ────────────────────────────────────────────────
  ayahs.forEach((a, ai) => {
    if (orderAyahs.has(ai)) mistakes.push({ type: "order", ayahKey: a.key });
    words[ai].forEach((w, wi) => {
      if (w.state === "omitted") mistakes.push({ type: "omitted", ayahKey: a.key, wordIndex: wi, expected: w.text });
      if (w.state === "incorrect") mistakes.push({ type: "incorrect", ayahKey: a.key, wordIndex: wi, expected: w.text, heard: w.heard });
      if (w.state === "uncertain") mistakes.push({ type: "uncertain", ayahKey: a.key, wordIndex: wi, expected: w.text, heard: w.heard, reason: w.reason, confidence: w.confidence });
    });
  });

  const extraWords: string[] = [];
  for (const r of insertions) {
    if (consumed.has(r)) continue;
    extraWords.push(R[r].text);
    const anchor = insertionAnchor.get(r) ?? -1;
    const ai = anchor >= 0 ? E[anchor].ayahIdx : 0;
    mistakes.push({ type: "added", ayahKey: ayahs[ai]?.key ?? `${range.surah}:${range.from}`, heard: R[r].text });
  }

  // ── Hesitations (only when the STT provider gives word timings) ──────
  for (let k = 1; k < R.length; k++) {
    const prevEnd = R[k - 1].end ?? R[k - 1].start;
    const start = R[k].start;
    if (prevEnd == null || start == null) continue;
    const gap = start - prevEnd;
    if (gap >= HESITATION_SEC) {
      const e = rToE.get(k);
      const ai = e != null ? E[e].ayahIdx : (insertionAnchor.get(k) ?? -1) >= 0 ? E[insertionAnchor.get(k)!].ayahIdx : 0;
      mistakes.push({ type: "hesitation", ayahKey: ayahs[ai].key, pauseSec: Math.round(gap * 10) / 10, wordIndex: e != null ? E[e].wordIdx : undefined });
    }
  }

  // ── Scores ───────────────────────────────────────────────────────────
  // Uncertain words (recognizer doubt) are NOT scored against the learner: they leave both the
  // numerator and the denominator, and an ayah whose only differences are uncertain is "uncertain".
  const results: AyahRecitationResult[] = ayahs.map((a, ai) => {
    const ws = words[ai];
    const ok = ws.filter((w) => w.state === "ok").length;
    const unc = ws.filter((w) => w.state === "uncertain").length;
    const scored = ws.length - unc;
    const added = mistakes.filter((m) => m.type === "added" && m.ayahKey === a.key).length;
    const accuracy = scored > 0 ? Math.max(0, ok / (scored + added * 0.5)) : 0;
    const own = mistakes.filter((m) => m.ayahKey === a.key);
    const certainError = own.some((m) => m.type === "omitted" || m.type === "order" || m.type === "incorrect");
    const status: AyahRecitationResult["status"] =
      unc > 0 && !certainError ? "uncertain" : accuracy >= 0.9 && !certainError ? "mastered" : accuracy >= 0.5 ? "needs-review" : "missed";
    return { key: a.key, ayah: a.ayah, accuracy, status, words: ws, mistakes: own };
  });

  const totalWords = E.length;
  const uncertainWords = results.reduce((s, r) => s + r.words.filter((w) => w.state === "uncertain").length, 0);
  const okWords = results.reduce((s, r) => s + r.words.filter((w) => w.state === "ok").length, 0);
  const scoredWords = totalWords - uncertainWords;
  const accuracy = scoredWords > 0 ? okWords / (scoredWords + extraWords.length * 0.5) : 0;

  return {
    range,
    accuracy: Math.round(accuracy * 1000) / 1000,
    ayahs: results,
    mistakes,
    extraWords,
    uncertainWords,
    transcript,
    textOnly: true,
  };
}
