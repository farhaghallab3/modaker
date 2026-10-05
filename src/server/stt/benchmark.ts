/**
 * DEVELOPMENT-ONLY raw STT benchmark. Sends the SAME audio bytes to each OpenAI transcription model and
 * reports exactly what each returned. It deliberately bypasses everything else in the app:
 *   - no scoring, no learner state, no review scheduling, no second opinion, no uncertainty heuristics;
 *   - no confusion mapping — comparison with the canonical text is exact match-key equality only;
 *   - the canonical text is never sent to a model (prompt is either absent or the generic domain sentence);
 *   - success = fidelity to what was SPOKEN (typed by the tester), NOT agreement with the Quran: a model that
 *     silently corrects a deliberate mistake, completes a half-recited ayah or inserts an omitted word FAILS;
 *   - the audio is held in memory for the request and discarded; the API key is never returned or logged.
 */
import { matchKey, normalizeArabic, tokenize } from "@/lib/quran/normalize";
import { env } from "../env";
import { wordsFromLogprobs, type TokenLogprob, type WhisperSegment } from "./evidence";
import { baseMime, extensionFor } from "./mime";
import { DOMAIN_PROMPT } from "./prompt";

/** Batch /audio/transcriptions models. Excluded: gpt-4o-transcribe-diarize (speaker diarization, different params), gpt-live-transcribe and gpt-realtime-whisper (Realtime API, not this endpoint). */
export const CANDIDATE_MODELS = ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe-2025-12-15", "gpt-transcribe"] as const;
export type PromptVariant = "none" | "domain";

export interface BenchResult {
  model: string;
  prompt: PromptVariant;
  ok: boolean;
  latencyMs: number;
  raw?: string;
  normalized?: string;
  error?: string;
  evidence?: {
    segments?: { start: number; end: number; avgLogprob: number; noSpeechProb: number; compressionRatio: number }[];
    words?: { text: string; probability: number }[];
    note: string;
  };
  /** exact-key comparison with the canonical words (no fuzzy matching, no confusion mapping) — informational only */
  comparison?: { exactMatches: number; canonicalWords: number; heardWords: number; missing: string[]; extra: string[] };
  /**
   * THE criterion: fidelity to what was actually SPOKEN (ground truth typed by the tester), not to the Quran.
   * A model that returns the canonical text for a deliberately wrong/incomplete recitation FAILS here.
   */
  fidelity?: Fidelity;
}

export interface Fidelity {
  /** transcript equals the spoken words exactly (exact match keys) */
  literal: boolean;
  spokenWords: number;
  matched: number;
  /** spoken words the transcript lacks */
  dropped: string[];
  /** transcript words that are not what was spoken, and ARE canonical words not spoken at that point: silent correction / completion */
  towardCanonical: string[];
  /** transcript words that are not spoken and not canonical either (hallucination / mishearing) */
  otherWrong: string[];
  /** the transcript equals the canonical text although the speaker did NOT say it exactly */
  silentlyCorrected: boolean;
}

/** Which transcription-capable models this key can actually use (from GET /v1/models). */
export async function listTranscriptionModels(): Promise<{ available: string[] | null; error?: string }> {
  try {
    const res = await fetch(`${env.openaiBaseUrl()}/models`, {
      headers: { authorization: `Bearer ${env.openaiApiKey()}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { available: null, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { data?: { id: string }[] };
    return { available: (data.data ?? []).map((m) => m.id).filter((id) => /whisper|transcribe/i.test(id)).sort() };
  } catch {
    return { available: null, error: "network error" };
  }
}

/** Longest-common-subsequence over EXACT match keys. Nothing is treated as "close enough". */
export function exactComparison(canonicalText: string, heardText: string): NonNullable<BenchResult["comparison"]> {
  const c = tokenize(canonicalText);
  const h = tokenize(heardText);
  const ck = c.map(matchKey);
  const hk = h.map(matchKey);
  const dp: number[][] = Array.from({ length: ck.length + 1 }, () => new Array(hk.length + 1).fill(0));
  for (let i = 1; i <= ck.length; i++) {
    for (let j = 1; j <= hk.length; j++) dp[i][j] = ck[i - 1] === hk[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const matchedC = new Set<number>();
  const matchedH = new Set<number>();
  for (let i = ck.length, j = hk.length; i > 0 && j > 0; ) {
    if (ck[i - 1] === hk[j - 1]) {
      matchedC.add(i - 1);
      matchedH.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return {
    exactMatches: matchedC.size,
    canonicalWords: c.length,
    heardWords: h.length,
    missing: c.filter((_, i) => !matchedC.has(i)),
    extra: h.filter((_, i) => !matchedH.has(i)),
  };
}

/** Fidelity of a transcript to the SPOKEN words, with divergences classified by whether they move toward the Quran text. */
export function fidelity(spokenText: string, canonicalText: string, heardText: string): Fidelity {
  const sw = tokenize(spokenText);
  const hw = tokenize(heardText);
  const sk = sw.map(matchKey);
  const hk = hw.map(matchKey);
  const ck = tokenize(canonicalText).map(matchKey);
  const dp: number[][] = Array.from({ length: sk.length + 1 }, () => new Array(hk.length + 1).fill(0));
  for (let i = 1; i <= sk.length; i++) {
    for (let j = 1; j <= hk.length; j++) dp[i][j] = sk[i - 1] === hk[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const mS = new Set<number>();
  const mH = new Set<number>();
  for (let i = sk.length, j = hk.length; i > 0 && j > 0; ) {
    if (sk[i - 1] === hk[j - 1]) {
      mS.add(i - 1);
      mH.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const spokenSet = new Set(sk);
  const canonSet = new Set(ck);
  // reported as (normalized) WORDS for readability; decided on exact match keys
  const dropped = sw.filter((_, i) => !mS.has(i));
  const unmatched = hw.map((w, j) => ({ w, k: hk[j], j })).filter((x) => !mH.has(x.j));
  const toward = unmatched.filter((x) => canonSet.has(x.k) && !spokenSet.has(x.k));
  const towardCanonical = toward.map((x) => x.w);
  const otherWrong = unmatched.filter((x) => !toward.includes(x)).map((x) => x.w);
  const literal = dropped.length === 0 && unmatched.length === 0;
  const sameAsCanon = hk.length === ck.length && hk.every((k, i) => k === ck[i]);
  const spokenIsCanon = sk.length === ck.length && sk.every((k, i) => k === ck[i]);
  return { literal, spokenWords: sk.length, matched: mS.size, dropped, towardCanonical, otherWrong, silentlyCorrected: sameAsCanon && !spokenIsCanon };
}

async function runOne(model: string, prompt: PromptVariant, audio: ArrayBuffer, mimeType: string, canonical: string, spoken: string): Promise<BenchResult> {
  const verbose = model.startsWith("whisper");
  const mime = baseMime(mimeType);
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), `bench.${extensionFor(mime)}`); // identical bytes for every call
  form.append("model", model);
  form.append("language", "ar");
  form.append("temperature", "0");
  if (prompt === "domain") form.append("prompt", DOMAIN_PROMPT);
  if (verbose) {
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
  } else {
    form.append("response_format", "json");
    form.append("include[]", "logprobs");
  }

  const t0 = performance.now();
  try {
    const res = await fetch(`${env.openaiBaseUrl()}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.openaiApiKey()}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      // The API's own error message does not contain the key; cap its length anyway.
      let msg = "";
      try {
        msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* ignore */
      }
      return { model, prompt, ok: false, latencyMs, error: `HTTP ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ""}` };
    }
    const data = (await res.json()) as { text?: string; segments?: WhisperSegment[]; logprobs?: TokenLogprob[] };
    const raw = (data.text ?? "").trim();
    const evidence: BenchResult["evidence"] = verbose
      ? {
          segments: data.segments?.map((s) => ({ start: s.start, end: s.end, avgLogprob: s.avg_logprob, noSpeechProb: s.no_speech_prob, compressionRatio: s.compression_ratio })),
          note: "segment-level only (no per-word probability)",
        }
      : data.logprobs?.length
        ? {
            words: wordsFromLogprobs(data.logprobs).map((w) => ({ text: w.text, probability: Math.round((w.confidence ?? 0) * 1000) / 1000 })),
            note: "per-word probability derived from token log-probabilities",
          }
        : { note: "none returned" };
    return { model, prompt, ok: true, latencyMs, raw, normalized: normalizeArabic(raw), evidence, comparison: exactComparison(canonical, raw), fidelity: fidelity(spoken, canonical, raw) };
  } catch {
    return { model, prompt, ok: false, latencyMs: Math.round(performance.now() - t0), error: "network error / timeout" };
  }
}

export async function runBenchmark(audio: ArrayBuffer, mimeType: string, canonical: string, spoken: string, models: string[], variants: PromptVariant[]): Promise<BenchResult[]> {
  return Promise.all(models.flatMap((m) => variants.map((v) => runOne(m, v, audio, mimeType, canonical, spoken))));
}
