/**
 * Pure state transitions for the learning loop. AppProvider calls these; tests call them directly.
 *
 *   memorization (declare) ──┐
 *                            ├─► per-ayah progress ──► review scheduling ──► dashboard / review queue
 *   recitation result ───────┘          ▲                                          │
 *                                       └──────── next recitation updates it ◄─────┘
 *
 * See src/lib/review/learning.ts for the definitions of completion, review state and mastery.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import { declareMemorized, isMemorized, recordOutcome, surahCompletion } from "@/lib/review/learning";
import { applySelfReview, weakOrigin, type SelfReviewOutcome } from "@/lib/review/self-review";
import type { AyahRange, RecitationAnalysis, SelfGrade } from "@/lib/types";
import { todayKey, uid, type RecitationSummary, type UserState } from "./state";

export function bumpActivity(s: UserState, field: "memorized" | "reviewed" | "recitations", n: number): UserState["activity"] {
  const k = todayKey();
  const exists = s.activity.some((a) => a.date === k);
  const base = exists ? s.activity : [...s.activity, { date: k, memorized: 0, reviewed: 0, recitations: 0 }];
  return base.map((a) => (a.date === k ? { ...a, [field]: a[field] + n } : a));
}

/**
 * The learner declares a range memorized. Declaring completes the ayahs (keeping any recitation
 * evidence they already have) and moves the stored resume hint forward.
 */
export function applyMarkMemorized(s: UserState, range: AyahRange, now = new Date()): UserState {
  const wasComplete = surahCompletion(s, range.surah).complete;
  const progress = { ...s.progress };
  let added = 0;
  for (let a = range.from; a <= range.to; a++) {
    const key = `${range.surah}:${a}`;
    if (!isMemorized(progress[key])) added++;
    progress[key] = declareMemorized(progress[key], range.surah, a, now);
  }
  const meta = getSurahMeta(range.surah);
  const nextAyah = meta && range.to < meta.ayahCount ? range.to + 1 : range.to;
  const resume =
    !s.resume || s.resume.surah !== range.surah || s.resume.ayah <= range.to
      ? { surah: range.surah, ayah: nextAyah, mode: "memorize" as const, updatedAt: now.toISOString() }
      : s.resume;

  const notifications = [...s.notifications];
  if (meta && !wasComplete && surahCompletion({ progress }, range.surah).complete) {
    notifications.unshift({
      id: uid("n"),
      kind: "goal-complete",
      title: `أتممت حفظ سورة ${meta.nameAr}`,
      body: "ثبّتها الله في قلبك. ستنتقل إلى مراجعاتك المتباعدة.",
      href: `/quran/${meta.number}`,
      createdAt: now.toISOString(),
      read: false,
    });
  }
  return { ...s, progress, resume, notifications, activity: bumpActivity(s, "memorized", added) };
}

/**
 * A saved recitation. Each ayah is updated from ITS OWN result — never the whole range from the
 * summary — and keeps the id of the summary as evidence. Reciting an ayah that was never declared
 * does not make it "memorized" unless the recitation itself shows recall (≥ 75 %).
 */
export function applyRecitation(s: UserState, analysis: RecitationAnalysis, now = new Date(), recId = uid("rec")): UserState {
  const progress = { ...s.progress };
  // Practice-only results (recognizer we have not validated, or too little was heard) never change learning
  // state: the learner sees the feedback, the history records the attempt, review/mastery stay as they were.
  const countsForLearning = analysis.learningEligible !== false && analysis.recognition !== "poor" && analysis.recognition !== "empty";
  for (const r of countsForLearning ? analysis.ayahs : []) {
    // The only differences are words we cannot attribute to the learner (recognizer doubt): this
    // recitation says nothing about the ayah, so its review state and evidence stay exactly as they were.
    if (r.status === "uncertain") continue;
    const [surah, ayah] = r.key.split(":").map(Number);
    // only confirmed differences count as mistakes (extra words, order and pauses are informational)
    const mistakes = r.mistakes.filter((m) => m.type === "incorrect" || m.type === "omitted").length;
    progress[r.key] = recordOutcome(progress[r.key], surah, ayah, { accuracy: r.accuracy, mistakes, recId }, now);
  }
  const { surah, from, to } = analysis.range;
  const summary: RecitationSummary = {
    id: recId,
    at: now.toISOString(),
    surah,
    from,
    to,
    accuracy: analysis.accuracy,
    mistakes: analysis.mistakes.length,
    mastered: analysis.ayahs.filter((a) => a.status === "mastered").length,
    needsReview: analysis.ayahs.filter((a) => a.status === "needs-review" || a.status === "missed").length,
    uncertain: analysis.ayahs.filter((a) => a.status === "uncertain").length,
    ...(countsForLearning ? {} : { practice: true }),
  };
  return {
    ...s,
    progress,
    recitations: [summary, ...s.recitations].slice(0, 100),
    activity: bumpActivity({ ...s, activity: bumpActivity(s, "recitations", 1) }, "reviewed", countsForLearning ? analysis.ayahs.filter((a) => a.status !== "uncertain").length : 0),
  };
}

/**
 * The learner self-assesses a whole review range (MVP: one grade for the range, no per-ayah picker).
 * Each ayah is updated by `applySelfReview`, which never touches recitation evidence and never reaches
 * mastery. "Reviewed" activity counts only ayahs that were actually credited today — repeated presses,
 * early reviews and ayahs decided by a recitation add nothing.
 */
export function applySelfReviewRange(
  s: UserState,
  range: AyahRange,
  grade: SelfGrade,
  now = new Date(),
): { state: UserState; counts: Record<SelfReviewOutcome, number>; stillNeedsRecitation: number } {
  const counts: Record<SelfReviewOutcome, number> = { credited: 0, downgraded: 0, "same-day": 0, "not-due": 0, "recitation-today": 0, "not-memorized": 0 };
  const progress = { ...s.progress };
  let stillNeedsRecitation = 0;
  for (let a = range.from; a <= range.to; a++) {
    const key = `${range.surah}:${a}`;
    const existing = progress[key];
    if (!existing) {
      counts["not-memorized"]++;
      continue;
    }
    const r = applySelfReview(existing, grade, now);
    counts[r.outcome]++;
    if (r.progress !== existing) progress[key] = r.progress;
    // a weakness from confirmed recitation evidence survives any self-assessment: say so honestly
    if ((r.outcome === "credited" || r.outcome === "downgraded") && weakOrigin(r.progress) === "recitation") stillNeedsRecitation++;
  }
  const changed = counts.credited + counts.downgraded > 0;
  return {
    state: changed ? { ...s, progress, activity: counts.credited ? bumpActivity(s, "reviewed", counts.credited) : s.activity } : s,
    counts,
    stillNeedsRecitation,
  };
}
