/**
 * HadeethEnc (موسوعة الأحاديث النبوية — https://hadeethenc.com) as Modaker's approved hadith source.
 * Official public API, no key. Terms of use: the content may be used WITHOUT modification, addition or deletion, with clear
 * attribution to the publisher and to HadeethEnc.com — so everything shown is verbatim API fields, never rewritten.
 *
 * Flow (see HadithProvider in ../safety/hadith.ts):
 *   question → search phrase (stop-words removed, no invention) → /hadeeths/search (candidate DISCOVERY only; its order is never trusted)
 *            → deterministic relevance filter on title/text → /hadeeths/multiple (the authoritative records)
 *            → validate (id, text, grade, reference) → re-check relevance on the full record → verbatim HadithBlock.
 * Anything doubtful — API error, timeout, malformed data, no relevant candidate, missing grade — returns [] (the assistant abstains).
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import { env } from "../env";
import { isApproved } from "../rag/sources";
import type { HadithBlock, HadithProvider } from "../safety/hadith";

export const HADEETHENC_SOURCE_ID = "hadeethenc:hadith";
export const HADEETHENC_SITE_NAME = "موسوعة الأحاديث النبوية – HadeethEnc";
const BASE = "https://hadeethenc.com/api/v1";

export const canonicalUrl = (id: string) => `https://hadeethenc.com/ar/browse/hadith/${encodeURIComponent(id)}`;

// ── query shaping ────────────────────────────────────────────────────────

/** Words that frame a hadith question but are not part of the hadith (normalized). The phrase is NOT invented: only these are removed. */
const FRAME_WORDS = new Set(
  [
    "ما", "ماذا", "هي", "هو", "هل", "صحه", "صحيح", "صح", "يصح", "تصح", "درجه", "درجة", "حديث", "الحديث", "احاديث", "حديثا", "هذا", "هذه", "ذلك", "تلك", "اذكر", "لي", "لنا",
    "اعطني", "اريد", "ابحث", "عن", "في", "من", "ثابت", "رواه", "روايه", "تخريج", "تخريجه", "ورد", "وارد", "الوارد", "اين", "كيف", "معني", "شرح", "نص", "المشهور", "المروي",
  ].map((w) => normalizeArabic(w)),
);

const PUNCT = /[؟?!.,،؛:;"'«»“”()\[\]{}\-–—*]/g;

/** "ما صحة حديث إنما الأعمال بالنيات؟" → "إنما الأعمال بالنيات". null when nothing usable (3–120 chars required by the API) remains. */
export function searchPhrase(question: string): string | null {
  const kept = question
    .replace(PUNCT, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FRAME_WORDS.has(normalizeArabic(w)));
  const phrase = kept.join(" ").trim();
  return phrase.length >= 3 && phrase.length <= 120 ? phrase : null;
}

// ── deterministic relevance ──────────────────────────────────────────────

/** Light stem: drop one clitic prefix and the article ("بالنيات" → "نيات", "والأعمال" → "اعمال"). */
function stem(w: string): string {
  let t = w;
  if (t.length > 4 && /^[وفبلك]ال/.test(t)) t = t.slice(1);
  if (t.length > 3 && t.startsWith("ال")) t = t.slice(2);
  else if (t.length > 4 && /^[وفبلك]/.test(t)) t = t.slice(1);
  return t;
}
const stems = (s: string) => new Set(normalizeArabic(s).split(" ").filter((w) => w.length >= 2).map(stem));

export interface Relevance {
  accepted: boolean;
  score: number;
  terms: number;
}

/**
 * Is this record about the phrase? Conservative on purpose: the phrase occurs in the title or text, OR every distinctive
 * term occurs in the TITLE. A word that merely occurs somewhere in a long text does not qualify.
 */
export function relevance(phrase: string, title: string, text: string): Relevance {
  const p = normalizeArabic(phrase);
  const terms = [...new Set(p.split(" ").filter((w) => w.length >= 3).map(stem))].filter((t) => t.length >= 2);
  if (!terms.length) return { accepted: false, score: 0, terms: 0 };
  const nt = normalizeArabic(title);
  const nx = normalizeArabic(text);
  const exactTitle = nt.includes(p);
  const exactText = nx.includes(p);
  const titleStems = stems(title);
  const inTitle = terms.filter((t) => titleStems.has(t)).length;
  const allInTitle = inTitle === terms.length;
  const accepted = exactTitle || exactText || allInTitle;
  const score = (exactTitle ? 4 : 0) + (exactText ? 3 : 0) + (allInTitle ? 2 : 0) + inTitle / terms.length;
  return { accepted, score, terms: terms.length };
}

// ── small TTL cache ──────────────────────────────────────────────────────

class TtlCache<T> {
  private m = new Map<string, { v: T; exp: number }>();
  constructor(
    private ttlMs: number,
    private max = 300,
    private now: () => number = Date.now,
  ) {}
  get(k: string): T | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < this.now()) {
      this.m.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: T) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { v, exp: this.now() + this.ttlMs });
  }
}

// ── API shapes (only what we read) ───────────────────────────────────────

interface SearchHit {
  id?: unknown;
  title?: unknown;
  hadith_text?: unknown;
}
interface FullRecord {
  id?: unknown;
  title?: unknown;
  hadeeth?: unknown;
  attribution?: unknown;
  grade?: unknown;
  reference?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
/** Highlight markup exists only in SEARCH candidates; it is stripped there (never from the authoritative record). */
const stripMarks = (s: string) => s.replace(/<\/?mark>/gi, "").replace(/<[^>]+>/g, "");

export interface HadeethEncOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  ttlMs?: number;
  /** most records fetched in full per question */
  maxFetch?: number;
  /** most hadith shown */
  maxResults?: number;
  /** a single-word query matching more title hits than this is too broad to answer */
  broadLimit?: number;
  now?: () => number;
  /** test hook: skip the registry check */
  ignoreRegistry?: boolean;
}

export class HadeethEncProvider implements HadithProvider {
  readonly id = "hadeethenc";
  private fetchImpl: typeof fetch;
  private base: string;
  private timeoutMs: number;
  private maxFetch: number;
  private maxResults: number;
  private broadLimit: number;
  private searches: TtlCache<SearchHit[]>;
  private records: TtlCache<FullRecord>;

  constructor(private opts: HadeethEncOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? BASE;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
    this.maxFetch = opts.maxFetch ?? 3;
    this.maxResults = opts.maxResults ?? 2;
    this.broadLimit = opts.broadLimit ?? 5;
    const ttl = opts.ttlMs ?? 6 * 3600_000;
    this.searches = new TtlCache(ttl, 200, opts.now);
    this.records = new TtlCache(ttl, 400, opts.now);
  }

  /** Usable only while the registry says the source is enabled and approved. */
  get available(): boolean {
    return this.opts.ignoreRegistry ? true : isApproved(HADEETHENC_SOURCE_ID);
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`HadeethEnc ${res.status}`);
    return res.json();
  }

  private async search(phrase: string): Promise<SearchHit[]> {
    const cached = this.searches.get(phrase);
    if (cached) return cached;
    const j = await this.getJson(`${this.base}/hadeeths/search/?language=ar&phrase=${encodeURIComponent(phrase)}`);
    if (!Array.isArray(j)) throw new Error("HadeethEnc search: unexpected shape");
    this.searches.set(phrase, j as SearchHit[]);
    return j as SearchHit[];
  }

  private async fetchRecords(ids: string[]): Promise<Map<string, FullRecord>> {
    const out = new Map<string, FullRecord>();
    const missing: string[] = [];
    for (const id of ids) {
      const c = this.records.get(id);
      if (c) out.set(id, c);
      else missing.push(id);
    }
    if (missing.length) {
      const j = await this.getJson(`${this.base}/hadeeths/multiple/?language=ar&ids=${missing.map(encodeURIComponent).join(",")}`);
      if (!Array.isArray(j)) throw new Error("HadeethEnc multiple: unexpected shape");
      for (const r of j as FullRecord[]) {
        const id = str(r?.id);
        if (id && missing.includes(id)) {
          this.records.set(id, r);
          out.set(id, r);
        }
      }
    }
    return out;
  }

  async find(question: string): Promise<HadithBlock[]> {
    try {
      if (!this.available) return [];
      const phrase = searchPhrase(question);
      if (!phrase) return [];

      // 1. discovery — never trust the order
      const hits = await this.search(phrase);
      const scored: { id: string; score: number }[] = [];
      let terms = 0;
      for (const h of hits) {
        const id = str(h.id) ?? (typeof h.id === "number" ? String(h.id) : null);
        const title = str(h.title);
        const text = str(h.hadith_text);
        if (!id || (!title && !text)) continue;
        const r = relevance(phrase, stripMarks(title ?? ""), stripMarks(text ?? ""));
        terms = r.terms;
        if (r.accepted) scored.push({ id, score: r.score });
      }
      if (!scored.length) return [];
      // a one-word query matching many records is not a request for a specific hadith
      if (terms === 1 && scored.length > this.broadLimit) return [];
      scored.sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id));
      const candidates = scored.slice(0, this.maxFetch);

      // 2. authoritative records
      const records = await this.fetchRecords(candidates.map((c) => c.id));
      const blocks: HadithBlock[] = [];
      for (const c of candidates) {
        const r = records.get(c.id);
        if (!r) continue;
        const text = str(r.hadeeth);
        const grade = str(r.grade);
        const reference = str(r.reference);
        const title = str(r.title) ?? "";
        if (!text || !grade || !reference) continue; // never fill a missing field
        if (!relevance(phrase, title, text).accepted) continue;
        const attribution = str(r.attribution) ?? undefined;
        blocks.push({
          type: "hadith",
          text,
          grade,
          reference,
          sourceId: HADEETHENC_SOURCE_ID,
          id: c.id,
          title: title || undefined,
          attribution,
          url: canonicalUrl(c.id),
          sourceTitle: HADEETHENC_SITE_NAME,
        });
        if (blocks.length >= this.maxResults) break;
      }
      return blocks;
    } catch (e) {
      console.warn("[hadith] HadeethEnc failed:", (e as Error).message);
      return [];
    }
  }
}

/** Provider from configuration: HADITH_PROVIDER=hadeethenc enables it; anything else leaves hadith requests abstaining. */
export function hadithProviderFromEnv(): HadeethEncProvider | undefined {
  return env.hadithProvider() === "hadeethenc" ? new HadeethEncProvider() : undefined;
}
