/**
 * Self-assessed review — the learner's own judgement of a review, complementing (never replacing or faking)
 * recitation evidence. Pure functions; the reducer in src/lib/store/reducers.ts applies them to a range.
 *
 *   ثبتت (solid)      I recalled it confidently.
 *   ترددت (hesitated)  I recalled it, but hesitated / needed effort.
 *   نسيت (forgot)      I could not recall it correctly.
 *
 * What a self-review MAY do: complete today's review, set the next review date, lower strength, keep an
 * ayah in the weak / review queues.
 * What it may NEVER do:
 *   - touch recitation evidence: `recent[]`, `accuracy`, `successCount`, `mistakeCount` are left exactly as they were;
 *   - reach `mastered` (only repeated, verified recitations do: scheduler.applyReview);
 *   - clear or overwrite a weakness that comes from confirmed recitation evidence (`weakBy === "recitation"`):
 *     recitation weakness outranks self weakness, and only a later valid recitation clears it;
 *   - turn a recitation attempt (passed OR failed) made today into something else: a recitation takes the day;
 *   - grow the interval faster than real time allows: one credited review per ayah per local day, growth only
 *     on due ayahs, and never beyond SELF_CAP_DAYS (or the existing interval, whichever is larger);
 *   - make a schedule created by confirmed recitation weakness LESS conservative: for a `weakBy === "recitation"`
 *     ayah a ثبتت only records that the learner reviewed today (history, lastReviewedAt) — interval, nextReviewAt,
 *     ease, streaks and status stay exactly as the recitation left them. ترددت / نسيت may only bring the next
 *     review closer (never later): self evidence can make such a weakness more conservative, never less.
 */
import { MAX_EASE, MIN_EASE, localDayKey, selfReviewedToday } from "./scheduler";
import { PASS_ACCURACY } from "./learning";
import type { AyahProgress, SelfGrade } from "@/lib/types";

const DAY = 86_400_000;

/** Self-reviewed ayahs come back at least this often (days) until a valid recitation confirms them. */
export const SELF_CAP_DAYS = 7;
const MAX_SELF_EVENTS = 5;

/** SM-2 quality each grade is treated as. "solid" is deliberately 4, never 5: no ease growth from self-report. */
export const SELF_QUALITY: Record<SelfGrade, number> = { solid: 4, hesitated: 3, forgot: 1 };
/** Higher = worse. Used by the same-day downgrade-only rule. */
export const SELF_RANK: Record<SelfGrade, number> = { solid: 0, hesitated: 1, forgot: 2 };

export type SelfReviewOutcome =
  | "credited" // applied as the day's first credited assessment
  | "downgraded" // a WORSE same-day assessment replaced the day's earlier one
  | "same-day" // equal or better than today's assessment: no additional credit
  | "not-due" // a "solid" on an ayah that is not due yet: recorded nowhere, no credit
  | "recitation-today" // a recitation already decided today for this ayah
  | "not-memorized"; // nothing to review

export interface SelfReviewResult {
  progress: AyahProgress;
  outcome: SelfReviewOutcome;
}

/** Where an ayah's weakness comes from, or undefined when it is not weak. Legacy rows are derived. */
export function weakOrigin(p: AyahProgress): "recitation" | "self" | undefined {
  if (p.status !== "weak") return undefined;
  if (p.weakBy) return p.weakBy;
  const last = p.recent?.[p.recent.length - 1];
  return last && last.accuracy < PASS_ACCURACY ? "recitation" : "self";
}

/** Was this ayah recited (and judged) today? Then the recitation, not a self-assessment, controls the day. */
function recitedToday(p: AyahProgress, now: Date): boolean {
  const last = p.recent?.[p.recent.length - 1];
  return !!last && localDayKey(new Date(last.at)) === localDayKey(now);
}

/** Is this ayah due for review today (or weak)? Self-review may only grow the interval of a due ayah. */
export function isDueForReview(p: AyahProgress, now: Date): boolean {
  if (p.status === "weak") return true;
  const due = p.nextReviewAt ? new Date(p.nextReviewAt).getTime() : now.getTime();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return due <= startOfDay.getTime() + DAY;
}

/** Apply `grade` to `base` as one credited event. `base` must be the state BEFORE today's assessment. */
function compute(base: AyahProgress, grade: SelfGrade, now: Date): AyahProgress {
  const q = SELF_QUALITY[grade];
  const origin = weakOrigin(base);
  const prev = Math.max(1, base.intervalDays || 1);
  const ease = Math.min(MAX_EASE, Math.max(MIN_EASE, base.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));

  // Confirmed recitation weakness: a positive self-assessment must not improve the recitation-origin schedule.
  if (origin === "recitation" && grade === "solid") {
    return { ...base, lastReviewedAt: now.toISOString() };
  }

  let intervalDays: number;
  let selfStreak = base.selfStreak ?? 0;
  let streak = base.streak;
  let status = base.status;
  let weakBy = base.weakBy;

  if (grade === "solid") {
    intervalDays = Math.max(1, Math.min(Math.round(prev * ease), Math.max(SELF_CAP_DAYS, prev)));
    selfStreak += 1;
    if (origin === "self") ({ status, weakBy } = { status: "memorized", weakBy: undefined });
  } else if (grade === "hesitated") {
    intervalDays = Math.max(1, Math.round(prev / 2));
    selfStreak = 0;
    streak = Math.max(0, streak - 1);
    if (origin === "self") ({ status, weakBy } = { status: "memorized", weakBy: undefined });
    else if (status === "mastered") status = "memorized"; // lowering strength: only a verified recitation re-earns mastery
  } else {
    intervalDays = 1; // نسيت → tomorrow
    selfStreak = 0;
    streak = 0;
    status = "weak";
    weakBy = origin === "recitation" ? "recitation" : "self"; // recitation weakness is never overwritten by "self"
  }

  let nextReviewAt = new Date(now.getTime() + intervalDays * DAY).toISOString();
  if (origin === "recitation") {
    // more conservative only: never a longer interval or a later date than the recitation-origin schedule
    intervalDays = Math.min(intervalDays, base.intervalDays || intervalDays);
    if (base.nextReviewAt && base.nextReviewAt < nextReviewAt) nextReviewAt = base.nextReviewAt;
  }
  const out: AyahProgress = {
    ...base,
    status,
    ease: Math.round(ease * 100) / 100,
    intervalDays,
    streak,
    selfStreak,
    lastReviewedAt: now.toISOString(),
    nextReviewAt,
  };
  if (weakBy) out.weakBy = weakBy;
  else delete out.weakBy;
  return out;
}

/** Restore the state captured before today's first credited self-review. */
function restore(p: AyahProgress): AyahProgress {
  const b = p.selfBefore;
  if (!b) return p;
  const out: AyahProgress = {
    ...p,
    intervalDays: b.intervalDays,
    ease: b.ease,
    selfStreak: b.selfStreak,
    streak: b.streak,
    status: b.status,
  };
  if (b.weakBy) out.weakBy = b.weakBy;
  else delete out.weakBy;
  if (b.nextReviewAt) out.nextReviewAt = b.nextReviewAt;
  else delete out.nextReviewAt;
  if (b.lastReviewedAt) out.lastReviewedAt = b.lastReviewedAt;
  else delete out.lastReviewedAt;
  return out;
}

/**
 * The learner self-assesses ONE ayah. Pure. See the file header for the guarantees.
 * Recitation evidence fields are never read for scoring and never written.
 */
export function applySelfReview(p: AyahProgress, grade: SelfGrade, now = new Date()): SelfReviewResult {
  if (p.status === "new" || p.status === "learning") return { progress: p, outcome: "not-memorized" };
  if (recitedToday(p, now)) return { progress: p, outcome: "recitation-today" };

  const event = { at: now.toISOString(), grade, source: "self" as const };
  const todays = selfReviewedToday(p, now) ? p.selfReviews![p.selfReviews!.length - 1] : null;

  if (todays) {
    // First credited assessment controls the day: equal or better repeats give nothing; a worse one
    // corrects the day's result, recomputed from the state BEFORE the day's first assessment.
    if (SELF_RANK[grade] <= SELF_RANK[todays.grade]) return { progress: p, outcome: "same-day" };
    const base = restore(p);
    const next = compute(base, grade, now);
    next.selfReviews = [...(p.selfReviews ?? []).slice(0, -1), event].slice(-MAX_SELF_EVENTS);
    if (p.selfBefore) next.selfBefore = p.selfBefore;
    return { progress: next, outcome: "downgraded" };
  }

  // Growing the interval needs a real, due review. Lowering (hesitated / forgot) is always honoured.
  if (grade === "solid" && !isDueForReview(p, now)) return { progress: p, outcome: "not-due" };

  const next = compute(p, grade, now);
  next.selfReviews = [...(p.selfReviews ?? []), event].slice(-MAX_SELF_EVENTS);
  next.selfBefore = {
    day: localDayKey(now),
    intervalDays: p.intervalDays,
    ease: p.ease,
    selfStreak: p.selfStreak ?? 0,
    streak: p.streak,
    status: p.status,
    ...(p.weakBy ? { weakBy: p.weakBy } : {}),
    ...(p.nextReviewAt ? { nextReviewAt: p.nextReviewAt } : {}),
    ...(p.lastReviewedAt ? { lastReviewedAt: p.lastReviewedAt } : {}),
  };
  return { progress: next, outcome: "credited" };
}

// ── what the UI may say about evidence (kept separate: a self-review is never "verified") ───────────

export interface EvidenceSummary {
  /** the learner's own most recent assessment, if any */
  lastSelf: { at: string; grade: SelfGrade } | null;
  /** the most recent saved recitation of this ayah that the app could judge (passed or not), if any */
  lastRecitation: { at: string; passed: boolean } | null;
}

export function evidenceSummary(p: AyahProgress): EvidenceSummary {
  const s = p.selfReviews?.[p.selfReviews.length - 1];
  const r = p.recent?.[p.recent.length - 1];
  return {
    lastSelf: s ? { at: s.at, grade: s.grade } : null,
    lastRecitation: r ? { at: r.at, passed: r.accuracy >= PASS_ACCURACY } : null,
  };
}

/**
 * Which ayahs of a recitation result may be offered a self-assessment: only those the recitation could NOT
 * decide. Confirmed outcomes (correct or different) are never offered — a self-assessment must not convert
 * them. When the result as a whole is not countable (poor recognition, or an unvalidated recognizer), every
 * ayah of the attempt was undecided and all may be offered.
 */
export function selfAssessable(analysis: {
  recognition: "good" | "poor" | "empty";
  learningEligible: boolean;
  ayahs: { key: string; status: "mastered" | "needs-review" | "missed" | "uncertain" }[];
}): string[] {
  const countable = analysis.recognition === "good" && analysis.learningEligible;
  return analysis.ayahs.filter((a) => (countable ? a.status === "uncertain" : true)).map((a) => a.key);
}
