/**
 * The learning model — three concepts that used to be blurred into one `status`:
 *
 *  1. COMPLETION  (isMemorized)  "has the learner memorized this ayah?"
 *       True once the learner DECLARED it memorized, or DEMONSTRATED recall by reciting it well
 *       (accuracy ≥ 75 %). It is about the memorization journey, not about quality. A fully
 *       memorized surah is 100 % complete even if some ayahs are weak.
 *       A recitation attempt that failed does NOT complete an ayah: the ayah becomes `learning`
 *       (tracked, with evidence, not counted as memorized).
 *
 *  2. REVIEW STATE (isWeak)      "does this ayah need work?"
 *       Derived from the LATEST recitation outcome through the scheduler (grade < 3 → weak). It is
 *       independent of completion: memorized ayahs can be weak. One good recitation clears it —
 *       it is not held down by an old blended average.
 *
 *  3. MASTERY     (isMastered)   "is it solid?"
 *       Earned only from repeated, spaced, accurate recitations (streak ≥ 4, accuracy ≥ 92 %,
 *       interval ≥ 14 days). Memorized ≠ mastered. No mastery number is shown unless it comes from
 *       persisted recitation evidence.
 *
 * Each ayah keeps its last few outcomes (`recent`) so every weak/strong judgement can be traced to
 * the recitation that caused it.
 *
 * RESUME is not a stored fact to trust blindly: `continuation()` derives "where to continue" from
 * the stored position AND what is actually memorized, so a stale pointer can never mislead.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import type { AyahProgress, ResumePoint } from "@/lib/types";
import { applyReview, gradeFromAccuracy, newAyahProgress } from "./scheduler";

/** Accuracy at which a recitation counts as a pass (scheduler grade 3). */
export const PASS_ACCURACY = 0.75;
const MAX_EVIDENCE = 5;

// ── the three concepts ───────────────────────────────────────────────────

/** COMPLETION: counted toward "7 of 7 memorized". */
export function isMemorized(p?: Pick<AyahProgress, "status"> | null): boolean {
  return !!p && p.status !== "new" && p.status !== "learning";
}

/** REVIEW STATE: needs work, per the latest recitation outcome. Independent of completion. */
export function isWeak(p?: Pick<AyahProgress, "status"> | null): boolean {
  return !!p && p.status === "weak";
}

/** MASTERY: solid through repeated spaced recitation. */
export function isMastered(p?: Pick<AyahProgress, "status"> | null): boolean {
  return !!p && p.status === "mastered";
}

/** The accuracy of the most recent recitation of this ayah, or null if it was never recited. */
export function latestAccuracy(p: AyahProgress): number | null {
  const last = p.recent?.[p.recent.length - 1];
  if (last) return last.accuracy;
  return p.accuracy ?? null; // legacy rows without evidence: the stored rolling value is the best we have
}

// ── recording what happened ──────────────────────────────────────────────

export interface Outcome {
  accuracy: number;
  mistakes: number;
  /** Id of the saved recitation summary that produced this outcome (traceability). */
  recId?: string;
}

function untracked(surah: number, ayah: number): AyahProgress {
  return { ...newAyahProgress(surah, ayah), status: "new", memorizedAt: undefined, nextReviewAt: undefined };
}

function withEvidence(p: AyahProgress, o: Outcome, now: Date): AyahProgress {
  const recent = [...(p.recent ?? []), { at: now.toISOString(), accuracy: o.accuracy, mistakes: o.mistakes, ...(o.recId ? { recId: o.recId } : {}) }];
  return { ...p, recent: recent.slice(-MAX_EVIDENCE) };
}

/** The learner declares an ayah memorized (or it is declared in onboarding). Keeps any evidence already gathered. */
export function declareMemorized(existing: AyahProgress | undefined, surah: number, ayah: number, now = new Date()): AyahProgress {
  if (isMemorized(existing)) return existing as AyahProgress;
  const base = existing ?? untracked(surah, ayah);
  const fresh = newAyahProgress(surah, ayah, now);
  const out: AyahProgress = { ...fresh, mistakeCount: base.mistakeCount, successCount: base.successCount };
  // keep what the recitations already told us (only fields that exist — rows stay free of undefined keys)
  if (base.recent) out.recent = base.recent;
  if (base.accuracy != null) out.accuracy = base.accuracy;
  if (base.lastReviewedAt) out.lastReviewedAt = base.lastReviewedAt;
  return out;
}

/**
 * Apply one recitation outcome to an ayah.
 *  - already memorized → the scheduler updates review state (weak / memorized / mastered) + schedule
 *  - not memorized, recited well (≥ 75 %) → recall is demonstrated: becomes memorized, then scheduled
 *  - not memorized, recited badly → stays `learning` with the evidence; NOT counted as memorized
 */
export function recordOutcome(existing: AyahProgress | undefined, surah: number, ayah: number, o: Outcome, now = new Date()): AyahProgress {
  let base = existing ?? untracked(surah, ayah);
  const passed = gradeFromAccuracy(o.accuracy) >= 3;

  if (!isMemorized(base)) {
    if (!passed) {
      const blended = base.accuracy == null ? o.accuracy : base.accuracy * 0.6 + o.accuracy * 0.4;
      return withEvidence(
        {
          ...base,
          status: "learning",
          accuracy: Math.round(blended * 1000) / 1000,
          mistakeCount: base.mistakeCount + o.mistakes,
          lastReviewedAt: now.toISOString(),
        },
        o,
        now,
      );
    }
    base = declareMemorized(base, surah, ayah, now); // demonstrated recall
  }
  return withEvidence(applyReview(base, { accuracy: o.accuracy, mistakes: o.mistakes }, now), o, now);
}

// ── derived views ────────────────────────────────────────────────────────

export interface LearningView {
  progress: Record<string, AyahProgress>;
  resume: ResumePoint | null;
  goals: { targetSurah?: number };
}

export interface SurahCompletion {
  memorized: number;
  total: number;
  /** COMPLETION ratio (memorized / total). Not mastery. */
  ratio: number;
  weak: number;
  mastered: number;
  complete: boolean;
}

export function surahCompletion(s: Pick<LearningView, "progress">, surah: number): SurahCompletion {
  const total = getSurahMeta(surah)?.ayahCount ?? 0;
  let memorized = 0;
  let weak = 0;
  let mastered = 0;
  for (const p of Object.values(s.progress)) {
    if (p.surah !== surah || !isMemorized(p)) continue;
    memorized++;
    if (isWeak(p)) weak++;
    if (isMastered(p)) mastered++;
  }
  return { memorized, total, ratio: total ? memorized / total : 0, weak, mastered, complete: total > 0 && memorized >= total };
}

/** Mean of the LATEST recitation accuracy of every ayah that has recitation evidence. */
export function recitationAccuracy(s: Pick<LearningView, "progress">): { value: number; ayahs: number } | null {
  const vals = Object.values(s.progress)
    .map(latestAccuracy)
    .filter((a): a is number => a != null);
  if (!vals.length) return null;
  return { value: vals.reduce((a, b) => a + b, 0) / vals.length, ayahs: vals.length };
}

/** One surah's share of the learner's whole memorization. */
export interface SurahOverview extends SurahCompletion {
  surah: number;
  /** ayahs recited but not yet shown to be memorized (tracked, not counted) */
  learning: number;
  /** contiguous runs of memorized ayahs — memorization is often fragmented */
  ranges: { from: number; to: number }[];
  /** most recent activity on this surah (ISO), or null */
  lastActivity: string | null;
}

/**
 * ALL memorized Quran, per surah. This — not the "current" surah — is the learner's memorization:
 * the current surah is only where they are working right now. A surah appears as soon as it has a
 * memorized or learning ayah, whether or not it is the one they are continuing.
 */
export function memorizationOverview(s: Pick<LearningView, "progress">): SurahOverview[] {
  const by = new Map<number, AyahProgress[]>();
  for (const p of Object.values(s.progress)) {
    if (!isMemorized(p) && p.status !== "learning") continue;
    const list = by.get(p.surah) ?? [];
    list.push(p);
    by.set(p.surah, list);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([surah, rows]) => {
      const c = surahCompletion(s, surah);
      const memorized = rows.filter(isMemorized).sort((a, b) => a.ayah - b.ayah);
      const ranges: SurahOverview["ranges"] = [];
      for (const p of memorized) {
        const last = ranges[ranges.length - 1];
        if (last && last.to + 1 === p.ayah) last.to = p.ayah;
        else ranges.push({ from: p.ayah, to: p.ayah });
      }
      const stamps = rows.flatMap((p) => [p.lastReviewedAt, p.memorizedAt]).filter((x): x is string => !!x).sort();
      return { ...c, surah, learning: rows.length - memorized.length, ranges, lastActivity: stamps[stamps.length - 1] ?? null };
    });
}

export type Continuation =
  | { kind: "none" }
  | { kind: "continue"; surah: number; ayah: number; mode: ResumePoint["mode"] }
  | { kind: "complete"; surah: number; next: { surah: number; ayah: number } | null };

function firstUnmemorized(progress: Record<string, AyahProgress>, surah: number, from: number, to: number): number | null {
  for (let a = from; a <= to; a++) if (!isMemorized(progress[`${surah}:${a}`])) return a;
  return null;
}

/**
 * RESUME: the next meaningful continuation point.
 *
 * The stored position is only a hint. Starting there, the continuation is the first ayah that is
 * NOT yet memorized (so a pointer left behind after ayahs were completed moves on by itself). If
 * the stored position is past the end, an earlier gap is returned. If the surah has no unmemorized
 * ayah at all it is COMPLETE — then the next target is the goal surah when it still has work,
 * otherwise nothing (the UI invites the learner to choose).
 */
/** The unfinished surah the learner touched most recently — where they are really working. */
function mostRecentUnfinished(s: LearningView, exceptSurah?: number): { surah: number; ayah: number } | null {
  const candidates = memorizationOverview(s)
    .filter((o) => !o.complete && o.surah !== exceptSurah)
    .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  for (const o of candidates) {
    const meta = getSurahMeta(o.surah);
    const ayah = meta ? firstUnmemorized(s.progress, o.surah, 1, meta.ayahCount) : null;
    if (ayah != null) return { surah: o.surah, ayah };
  }
  return null;
}

export function continuation(s: LearningView): Continuation {
  const r = s.resume;
  const meta = r ? getSurahMeta(r.surah) : undefined;
  if (!r || !meta) {
    // No usable stored position: continue where the learner was most recently working, if anywhere.
    const recent = mostRecentUnfinished(s);
    return recent ? { kind: "continue", surah: recent.surah, ayah: recent.ayah, mode: "memorize" } : { kind: "none" };
  }

  const start = Math.min(Math.max(1, r.ayah), meta.ayahCount);
  const ahead = firstUnmemorized(s.progress, meta.number, start, meta.ayahCount);
  if (ahead != null) return { kind: "continue", surah: meta.number, ayah: ahead, mode: r.mode };
  const gap = firstUnmemorized(s.progress, meta.number, 1, start - 1);
  if (gap != null) return { kind: "continue", surah: meta.number, ayah: gap, mode: r.mode };

  // This surah is complete. Next: the goal surah if it still has work, else the unfinished surah the
  // learner worked on most recently (their real "current" position), else nothing (the UI invites a choice).
  const goal = s.goals.targetSurah;
  const goalMeta = goal && goal !== meta.number ? getSurahMeta(goal) : undefined;
  const goalAyah = goalMeta ? firstUnmemorized(s.progress, goalMeta.number, 1, goalMeta.ayahCount) : null;
  const next = goalMeta && goalAyah != null ? { surah: goalMeta.number, ayah: goalAyah } : mostRecentUnfinished(s, meta.number);
  return { kind: "complete", surah: meta.number, next };
}

/** The ayah "memorize" should open at inside one surah (the continuation when it is this surah, else its first gap, else 1). */
export function startAyahFor(s: LearningView, surah: number): number {
  const c = continuation(s);
  if (c.kind === "continue" && c.surah === surah) return c.ayah;
  const meta = getSurahMeta(surah);
  return (meta && firstUnmemorized(s.progress, surah, 1, meta.ayahCount)) || 1;
}

/** Where "continue memorizing" should open: a surah + ayah, or null when there is nothing to continue. */
export function nextToMemorize(s: LearningView): { surah: number; ayah: number } | null {
  const c = continuation(s);
  if (c.kind === "continue") return { surah: c.surah, ayah: c.ayah };
  if (c.kind === "complete") return c.next;
  return null;
}

