/**
 * Quran quotation verification.
 *
 * A user may quote an ayah with a mistake. The assistant must not reason over the corrupted text
 * as if it were scripture. This module compares quoted text against the VERIFIED corpus (the
 * QuranProvider's text — never anything model-generated) and returns one of:
 *
 *   none       no Quran quotation detected
 *   exact      the quoted words are an exact, contiguous fragment of a verse (nothing to fix)
 *   corrected  a likely intended ayah (or 2–3 consecutive ayahs) was found with high confidence;
 *              the caller shows the verified text with surah / ayah / source
 *   ambiguous  something looks like a quotation but confidence is too low to guess; the caller
 *              asks the user to clarify and offers candidates — it never picks one silently
 *
 * Detection is conservative. An explicit quotation (« », ﴿ ﴾, " ", or after «قال تعالى») is checked
 * with lower thresholds; a quotation hidden inside ordinary prose must clear a much higher bar, so a
 * normal question that merely shares a few words with some verse is left alone.
 *
 * Comparison is on a skeleton (no diacritics, unified letters, no alef — see matchKey), so
 * Uthmani/modern spelling differences never count as errors.
 */
import { keySimilarity, matchKey, tokenize } from "@/lib/quran/normalize";
import type { Ayah } from "@/lib/types";

export interface QuoteMatch {
  surah: number;
  from: number;
  to: number;
  /** Verified verses (from the provider). */
  verses: Ayah[];
  /** 0..1 — Dice similarity between the quoted span and the matched verse window. */
  similarity: number;
  matchedWords: number;
  /** What differs, in skeleton words. */
  diff: { missing: string[]; extra: string[]; changed: [string, string][] };
}

export type QuoteResult =
  | { status: "none" }
  | { status: "exact"; match: QuoteMatch }
  | { status: "corrected"; match: QuoteMatch; alternatives: QuoteMatch[] }
  | { status: "ambiguous"; candidates: QuoteMatch[] };

interface Entry {
  surah: number;
  from: number;
  to: number;
  keys: string[];
  words: string[];
  verses: Ayah[];
  /** Index in `keys` where each verse starts. */
  offsets: number[];
}

const MAX_WINDOW = 3; // ayahs per entry
const MAX_DF = 400; // ignore words that appear in more entries than this when voting
const MAX_QUERY_WORDS = 60;
const TOP_CANDIDATES = 12;

const QUOTE_DELIMITED = [/«([^»]{6,})»/g, /﴿([^﴾]{6,})﴾?/g, /"([^"]{6,})"/g, /“([^”]{6,})”/g];
const QURANIC_MARKS = /[ٰٱۖ-ۭ]/;
// "قال تعالى: …" / "في قوله …" — the text after the intro is an explicit quotation.
const QUOTE_INTRO = /(?:قال(?: الله)? تعالى|قوله تعالى|يقول الله(?: تعالى)?|في قوله|قال عز وجل)\s*[:：]?\s*([^؟?]+?)(?=\s*(?:ما معنى|ما تفسير|ما المقصود|اشرح|فسر|لماذا|[؟?])|$)/;

function extractSpans(question: string): { spans: string[]; explicit: boolean } {
  const spans: string[] = [];
  for (const re of QUOTE_DELIMITED) for (const m of question.matchAll(re)) spans.push(m[1]);
  const intro = QUOTE_INTRO.exec(question);
  if (intro?.[1] && tokenize(intro[1]).length >= 3) spans.push(intro[1]);
  if (spans.length) return { spans, explicit: true };
  // Uthmani annotation marks inside plain prose are a strong sign of pasted scripture.
  if (QURANIC_MARKS.test(question)) return { spans: [question], explicit: true };
  return { spans: [question], explicit: false };
}

interface Alignment {
  pairs: { q: number; a: number; exact: boolean }[];
}

/** LCS over skeleton words, with a fuzzy equality for longer words (one or two letters off). */
function align(q: string[], a: string[]): Alignment {
  const m = q.length;
  const n = a.length;
  const eq = (x: string, y: string): 0 | 1 | 2 => (x === y ? 2 : x.length >= 4 && y.length >= 4 && keySimilarity(x, y) >= 0.75 ? 1 : 0);
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = eq(q[i - 1], a[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs: Alignment["pairs"] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const e = eq(q[i - 1], a[j - 1]);
    if (e && dp[i][j] === dp[i - 1][j - 1] + 1) {
      pairs.push({ q: i - 1, a: j - 1, exact: e === 2 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { pairs: pairs.reverse() };
}

export class QuranQuoteIndex {
  private entries: Entry[] = [];
  private inverted = new Map<string, number[]>();

  constructor(ayahs: Ayah[]) {
    const bySurah = new Map<number, Ayah[]>();
    for (const a of ayahs) {
      const list = bySurah.get(a.surah) ?? [];
      list.push(a);
      bySurah.set(a.surah, list);
    }
    for (const [surah, list] of bySurah) {
      list.sort((x, y) => x.ayah - y.ayah);
      for (let i = 0; i < list.length; i++) {
        for (let w = 1; w <= MAX_WINDOW && i + w <= list.length; w++) {
          const verses = list.slice(i, i + w);
          const perVerse = verses.map((v) => tokenize(v.textUthmani));
          const offsets: number[] = [];
          let at = 0;
          for (const t of perVerse) {
            offsets.push(at);
            at += t.length;
          }
          const words = perVerse.flat();
          const keys = words.map(matchKey);
          const idx = this.entries.length;
          this.entries.push({ surah, from: verses[0].ayah, to: verses[w - 1].ayah, keys, words, verses, offsets });
          for (const k of new Set(keys)) {
            if (k.length < 2) continue;
            const l = this.inverted.get(k);
            if (l) l.push(idx);
            else this.inverted.set(k, [idx]);
          }
        }
      }
    }
  }

  get size() {
    return this.entries.length;
  }

  check(question: string): QuoteResult {
    const { spans, explicit } = extractSpans(question);
    let best: QuoteResult = { status: "none" };
    let bestScore = -1;
    for (const span of spans) {
      const r = this.checkSpan(span, explicit);
      const score = r.status === "none" ? -1 : r.status === "exact" ? 3 : r.status === "corrected" ? 2 : 1;
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  }

  private candidates(qKeys: string[]): number[] {
    const votes = new Map<number, number>();
    for (const k of new Set(qKeys)) {
      const list = this.inverted.get(k);
      if (!list || list.length > MAX_DF) continue;
      const w = 1 / list.length;
      for (const idx of list) votes.set(idx, (votes.get(idx) ?? 0) + w);
    }
    return [...votes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CANDIDATES)
      .map(([idx]) => idx);
  }

  private checkSpan(span: string, explicit: boolean): QuoteResult {
    const words = tokenize(span).slice(0, MAX_QUERY_WORDS);
    const qKeys = words.map(matchKey);
    if (qKeys.length < 3) return { status: "none" };

    const scored: { match: QuoteMatch; exactAll: boolean }[] = [];
    for (const idx of this.candidates(qKeys)) {
      const e = this.entries[idx];
      const { pairs } = align(qKeys, e.keys);
      const matched = pairs.length;
      if (matched < Math.min(explicit ? 3 : 4, e.keys.length)) continue;

      const qStart = explicit ? 0 : pairs[0].q;
      const qEnd = explicit ? qKeys.length - 1 : pairs[pairs.length - 1].q;
      const spanLen = qEnd - qStart + 1;
      const aStart = pairs[0].a;
      const aEnd = pairs[pairs.length - 1].a;
      // Quoting only the opening/ending of an ayah is fine; compare against the window actually covered.
      const windowLen = aEnd - aStart + 1;
      const similarity = (2 * matched) / (spanLen + windowLen);
      const exactAll = pairs.every((p) => p.exact) && spanLen === matched && windowLen === matched;

      const matchedQ = new Set(pairs.map((p) => p.q));
      const matchedA = new Set(pairs.map((p) => p.a));
      // Trim the window to the verses that actually contain matched words: quoting ayah 5 must be
      // reported as 5, not as the 3–5 window that merely contains it.
      const verseAt = (pos: number) => {
        let v = 0;
        e.offsets.forEach((o, i) => {
          if (o <= pos) v = i;
        });
        return v;
      };
      const firstV = verseAt(aStart);
      const lastV = verseAt(aEnd);
      const verses = e.verses.slice(firstV, lastV + 1);
      scored.push({
        exactAll,
        match: {
          surah: e.surah,
          from: verses[0].ayah,
          to: verses[verses.length - 1].ayah,
          verses,
          similarity,
          matchedWords: matched,
          diff: {
            missing: e.words.filter((_, i) => i >= aStart && i <= aEnd && !matchedA.has(i)),
            extra: words.filter((_, i) => i >= qStart && i <= qEnd && !matchedQ.has(i)),
            changed: pairs.filter((p) => !p.exact).map((p) => [words[p.q], e.words[p.a]] as [string, string]),
          },
        },
      });
    }
    if (!scored.length) return { status: "none" };

    // Prefer longer matches, then higher similarity; windows that trim to the same verses collapse
    // into the best-scoring one (the list is sorted, so the first occurrence is the best).
    scored.sort((x, y) => y.match.matchedWords - x.match.matchedWords || y.match.similarity - x.match.similarity);
    const seenRange = new Set<string>();
    for (let i = 0; i < scored.length; ) {
      const m = scored[i].match;
      const key = `${m.surah}:${m.from}-${m.to}`;
      if (seenRange.has(key)) scored.splice(i, 1);
      else {
        seenRange.add(key);
        i++;
      }
    }
    const top = scored[0];

    if (top.exactAll) return { status: "exact", match: top.match };

    const minMatched = explicit ? 3 : 5;
    const corrected = top.match.matchedWords >= minMatched && top.match.similarity >= (explicit ? 0.7 : 0.8);
    // A near-identical runner-up covering a DIFFERENT place means we cannot tell which verse was meant.
    const rival = scored.find(
      (s) => s !== top && !(s.match.surah === top.match.surah && s.match.from <= top.match.to && s.match.to >= top.match.from) && top.match.similarity - s.match.similarity < 0.08,
    );

    if (corrected && !rival) {
      const alternatives = scored.filter((s) => s !== top && s.match.similarity >= 0.6).slice(0, 2).map((s) => s.match);
      return { status: "corrected", match: top.match, alternatives };
    }
    // Looks like a quotation but nothing is confident enough: judge by the BEST similarity among all
    // plausible candidates (the longest match is not always the most similar), then ask the user.
    const plausible = scored
      .filter((s) => s.match.matchedWords >= 3 && s.match.similarity >= 0.5)
      .sort((x, y) => y.match.similarity - x.match.similarity || y.match.matchedWords - x.match.matchedWords);
    if (explicit && plausible.length) {
      return { status: "ambiguous", candidates: plausible.slice(0, 3).map((s) => s.match) };
    }
    return { status: "none" };
  }
}
