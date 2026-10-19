/**
 * Self-assessed review (ثبتت / ترددت / نسيت). The point of every test here: a self-assessment may
 * complete a review and move the schedule, but it is NOT recitation evidence, can never reach mastery, can
 * never overwrite or clear a weakness that comes from confirmed recitation evidence, and cannot be farmed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { declareMemorized, isMastered, isWeak, recordOutcome, recitationAccuracy } from "../src/lib/review/learning";
import { buildReviewQueue, applyReview } from "../src/lib/review/scheduler";
import { applySelfReview, evidenceSummary, SELF_CAP_DAYS, selfAssessable, weakOrigin } from "../src/lib/review/self-review";
import { lastRecitationLabel, lastSelfLabel, selfReviewMessage, SELF_GRADES } from "../src/lib/review/labels";
import { applyRecitation, applySelfReviewRange } from "../src/lib/store/reducers";
import { averageAccuracy, weakAyahs } from "../src/lib/store/selectors";
import { EMPTY_STATE, type UserState } from "../src/lib/store/state";
import type { AyahProgress, RecitationAnalysis, SelfGrade } from "../src/lib/types";
import { userStateSchema } from "../src/server/user/schema";

const DAY = 86_400_000;
const T = new Date(2026, 9, 10, 10, 0, 0); // local time
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** A memorized ayah that is due today. */
function due(over: Partial<AyahProgress> = {}, ayah = 1): AyahProgress {
  return { ...declareMemorized(undefined, 67, ayah, addDays(T, -1)), ...over };
}
const stateOf = (...rows: AyahProgress[]): UserState => ({ ...EMPTY_STATE, progress: Object.fromEntries(rows.map((r) => [r.key, r])) });

/** Fields that ARE recitation evidence/statistics. A self-review must leave them byte-for-byte identical. */
const evidenceOf = (p: AyahProgress) => JSON.stringify({ recent: p.recent, accuracy: p.accuracy, successCount: p.successCount, mistakeCount: p.mistakeCount });

// ── exact scheduler effect of each choice ────────────────────────────────

test("ثبتت: ease unchanged, interval grows one step (capped), self streak +1, review completed", () => {
  const r = applySelfReview(due(), "solid", T);
  assert.equal(r.outcome, "credited");
  assert.equal(r.progress.ease, 2.3, "no ease growth from self-report");
  assert.equal(r.progress.intervalDays, 2);
  assert.equal(r.progress.selfStreak, 1);
  assert.equal(r.progress.status, "memorized");
  assert.equal(r.progress.nextReviewAt, addDays(T, 2).toISOString());
  assert.equal(r.progress.lastReviewedAt, T.toISOString());
  assert.deepEqual(r.progress.selfReviews, [{ at: T.toISOString(), grade: "solid", source: "self" }]);
});

test("ثبتت interval table: 1→2, 2→5, 5→7, 7→7, and a longer verified interval is kept, not shortened", () => {
  const next = (intervalDays: number) => applySelfReview(due({ intervalDays }), "solid", T).progress.intervalDays;
  assert.deepEqual([1, 2, 5, 7, 40].map(next), [2, 5, 7, 7, 40]);
  assert.equal(SELF_CAP_DAYS, 7);
});

test("ترددت: ease −0.14, interval halves, self streak resets, mastered drops to memorized", () => {
  const r = applySelfReview(due({ intervalDays: 7, selfStreak: 3, streak: 4, status: "mastered" }), "hesitated", T).progress;
  assert.equal(r.ease, 2.16);
  assert.equal(r.intervalDays, 4);
  assert.equal(r.selfStreak, 0);
  assert.equal(r.streak, 3);
  assert.equal(r.status, "memorized");
});

test("نسيت: tomorrow, ease −0.54 (floor 1.3), weak (self-origin), streaks reset", () => {
  const r = applySelfReview(due({ intervalDays: 30, streak: 4, selfStreak: 2 }), "forgot", T).progress;
  assert.equal(r.intervalDays, 1);
  assert.equal(r.nextReviewAt, addDays(T, 1).toISOString());
  assert.equal(r.ease, 1.76);
  assert.equal(r.status, "weak");
  assert.equal(r.weakBy, "self");
  assert.equal(r.streak, 0);
  assert.equal(r.selfStreak, 0);
  assert.equal(applySelfReview(due({ ease: 1.4 }), "forgot", T).progress.ease, 1.3);
});

// ── self-review is NOT recitation evidence ───────────────────────────────

test("recitation statistics are byte-for-byte unchanged by any self-review", () => {
  const withEvidence = recordOutcome(due(), 67, 1, { accuracy: 0.8, mistakes: 1, recId: "rec_1" }, addDays(T, -3));
  const base = { ...withEvidence, nextReviewAt: T.toISOString() };
  for (const g of ["solid", "hesitated", "forgot"] as SelfGrade[]) {
    const out = applySelfReview(base, g, T).progress;
    assert.equal(evidenceOf(out), evidenceOf(base), g);
  }
  // …and the aggregate numbers the dashboard shows
  const before = stateOf(base);
  const after = applySelfReviewRange(before, { surah: 67, from: 1, to: 1 }, "solid", T).state;
  assert.deepEqual(averageAccuracy(after), averageAccuracy(before));
  assert.deepEqual(recitationAccuracy(after), recitationAccuracy(before));
});

test("self-review leaves recitation-less ayahs without any accuracy", () => {
  const out = applySelfReview(due(), "solid", T).progress;
  assert.equal(out.accuracy, undefined);
  assert.equal(out.recent, undefined);
  assert.equal(recitationAccuracy(stateOf(out)), null);
});

// ── mastery cannot be manufactured ───────────────────────────────────────

test("30 consecutive self-rated ثبتت reviews never reach mastered, and the interval stays ≤ 7 days", () => {
  let p = due();
  for (let i = 0; i < 30; i++) {
    const now = new Date(p.nextReviewAt!);
    const r = applySelfReview(p, "solid", now);
    assert.equal(r.outcome, "credited", `review ${i + 1}`);
    p = r.progress;
    assert.notEqual(p.status, "mastered");
    assert.ok(p.intervalDays <= SELF_CAP_DAYS, `interval ${p.intervalDays}`);
  }
  assert.equal(p.selfStreak, 30);
  assert.equal(isMastered(p), false);
});

test("even with a strong verified history, self-review cannot award mastery", () => {
  const strong = due({ streak: 4, accuracy: 0.95, intervalDays: 14, status: "memorized" });
  const out = applySelfReview(strong, "solid", T).progress;
  assert.equal(out.status, "memorized");
  assert.equal(isMastered(out), false);
});

test("a verified mastery is kept by ثبتت but lowered by ترددت / نسيت (strength may only go down)", () => {
  const m = due({ status: "mastered", streak: 5, accuracy: 0.97, intervalDays: 30 });
  assert.equal(applySelfReview(m, "solid", T).progress.status, "mastered");
  assert.equal(applySelfReview(m, "hesitated", T).progress.status, "memorized");
  assert.equal(applySelfReview(m, "forgot", T).progress.status, "weak");
});

// ── anti-gaming: one credited assessment per ayah per day ────────────────

test("ثبتت → ثبتت → ثبتت on the same day gives no extra credit", () => {
  const first = applySelfReview(due(), "solid", T);
  const t2 = new Date(T.getTime() + 60_000);
  const second = applySelfReview(first.progress, "solid", t2);
  const third = applySelfReview(second.progress, "solid", new Date(T.getTime() + 120_000));
  assert.equal(first.outcome, "credited");
  assert.equal(second.outcome, "same-day");
  assert.equal(third.outcome, "same-day");
  assert.deepEqual(second.progress, first.progress, "nothing changed — not even the timestamp");
  assert.deepEqual(third.progress, first.progress);
  assert.equal(third.progress.selfReviews!.length, 1);
  assert.equal(third.progress.selfStreak, 1);
});

test("same-day downgrade is recomputed from the ORIGINAL state, not stacked on the earlier credit", () => {
  const original = due({ intervalDays: 5 });
  const afterSolid = applySelfReview(original, "solid", T).progress; // 5 → 7
  assert.equal(afterSolid.intervalDays, 7);
  for (const worse of ["hesitated", "forgot"] as SelfGrade[]) {
    const corrected = applySelfReview(afterSolid, worse, new Date(T.getTime() + 60_000));
    assert.equal(corrected.outcome, "downgraded");
    const direct = applySelfReview(original, worse, new Date(T.getTime() + 60_000)).progress;
    for (const k of ["ease", "intervalDays", "status", "weakBy", "selfStreak", "streak"] as const) assert.equal(corrected.progress[k], direct[k], `${worse}.${k}`);
    assert.equal(corrected.progress.selfReviews!.length, 1, "the day's assessment is replaced, not appended");
    assert.equal(corrected.progress.selfReviews![0].grade, worse);
  }
});

test("a better or equal same-day assessment can never raise the result (forgot → ثبتت is ignored)", () => {
  const forgot = applySelfReview(due(), "forgot", T).progress;
  for (const g of ["solid", "hesitated", "forgot"] as SelfGrade[]) {
    const r = applySelfReview(forgot, g, new Date(T.getTime() + 5 * 60_000));
    assert.equal(r.outcome, "same-day", g);
    assert.deepEqual(r.progress, forgot);
  }
});

test("a ثبتت on an ayah that is not due yet gives no credit; lowering is still honoured", () => {
  const notDue = due({ nextReviewAt: addDays(T, 5).toISOString(), intervalDays: 5 });
  const solid = applySelfReview(notDue, "solid", T);
  assert.equal(solid.outcome, "not-due");
  assert.deepEqual(solid.progress, notDue);
  const forgot = applySelfReview(notDue, "forgot", T);
  assert.equal(forgot.outcome, "credited");
  assert.equal(forgot.progress.status, "weak");
});

test("ayahs that are not memorized are not reviewable", () => {
  for (const status of ["new", "learning"] as const) {
    const p = due({ status });
    assert.equal(applySelfReview(p, "solid", T).outcome, "not-memorized");
  }
});

// ── weak provenance: recitation weakness outranks self weakness ──────────

const recitationWeak = (): AyahProgress => recordOutcome(due(), 67, 1, { accuracy: 0.3, mistakes: 3, recId: "rec_bad" }, addDays(T, -1));

test("a recitation outcome below passing marks the weakness as recitation-origin", () => {
  const w = recitationWeak();
  assert.equal(w.status, "weak");
  assert.equal(w.weakBy, "recitation");
  assert.equal(weakOrigin(w), "recitation");
});

test("REDUCER: self-review can never clear, overwrite or soften recitation-origin weakness", () => {
  const w = { ...recitationWeak(), nextReviewAt: T.toISOString() };
  const before = stateOf(w);
  for (const g of ["solid", "hesitated", "forgot"] as SelfGrade[]) {
    const after = applySelfReviewRange(before, { surah: 67, from: 1, to: 1 }, g, T).state.progress["67:1"];
    assert.equal(after.status, "weak", `${g}: still weak`);
    assert.equal(after.weakBy, "recitation", `${g}: origin stays recitation (never overwritten by "self")`);
    assert.equal(isWeak(after), true);
    assert.equal(evidenceOf(after), evidenceOf(w), `${g}: recitation evidence untouched`);
  }
  // it records today's review but still needs a verified recitation, on the schedule the recitation set
  const solid = applySelfReview(w, "solid", T).progress;
  assert.equal(solid.intervalDays, w.intervalDays);
  assert.equal(solid.nextReviewAt, w.nextReviewAt);
  assert.equal(weakAyahs(stateOf(solid)).length, 1, "still listed under needs-attention");
});

test("the weakness is cleared only by a later valid recitation", () => {
  const w = { ...recitationWeak(), nextReviewAt: T.toISOString() };
  const selfed = applySelfReview(w, "solid", T).progress;
  const later = addDays(T, 1);
  const cleared = recordOutcome(selfed, 67, 1, { accuracy: 0.95, mistakes: 0, recId: "rec_good" }, later);
  assert.equal(cleared.status, "memorized");
  assert.equal(cleared.weakBy, undefined);
  assert.equal(cleared.selfBefore, undefined, "the recitation superseded the self-review");
});

test("legacy weak rows: derived origin — failing recent entry ⇒ recitation; no recitation evidence ⇒ self (clearable)", () => {
  const legacyRec: AyahProgress = { ...due(), status: "weak", recent: [{ at: addDays(T, -2).toISOString(), accuracy: 0.4, mistakes: 2 }] };
  assert.equal(weakOrigin(legacyRec), "recitation");
  assert.equal(applySelfReview(legacyRec, "solid", T).progress.status, "weak");
  const legacyAdded: AyahProgress = { ...due(), status: "weak" }; // e.g. "add to review"
  assert.equal(weakOrigin(legacyAdded), "self");
  const cleared = applySelfReview(legacyAdded, "solid", T).progress;
  assert.equal(cleared.status, "memorized");
  assert.equal(cleared.weakBy, undefined);
});

test("self-origin weakness (نسيت) is cleared by a later ثبتت or ترددت, on a later day", () => {
  const forgot = applySelfReview(due(), "forgot", T).progress;
  const day2 = new Date(forgot.nextReviewAt!);
  assert.equal(applySelfReview(forgot, "solid", day2).progress.status, "memorized");
  assert.equal(applySelfReview(forgot, "hesitated", day2).progress.status, "memorized");
});

// ── interaction with recitation ──────────────────────────────────────────

const analysisFor = (over: Partial<RecitationAnalysis> & { ayahs: RecitationAnalysis["ayahs"] }): RecitationAnalysis => ({
  range: { surah: 67, from: 1, to: over.ayahs.length },
  accuracy: 0,
  mistakes: [],
  extraWords: [],
  uncertainWords: 0,
  matchedWords: 0,
  expectedWords: 0,
  recognition: "good",
  learningEligible: true,
  transcript: { text: "x", provider: "openai:whisper-1", language: "ar" },
  textOnly: true,
  ...over,
});
const result = (ayah: number, status: "mastered" | "needs-review" | "missed" | "uncertain", accuracy: number) => ({
  key: `67:${ayah}`,
  ayah,
  accuracy,
  status,
  words: [],
  mistakes: status === "needs-review" || status === "missed" ? [{ type: "incorrect" as const, ayahKey: `67:${ayah}` }] : [],
});

test("a confirmed recitation difference cannot be overridden by pressing ثبتت (same attempt, reducer level)", () => {
  const s0 = stateOf(due());
  const s1 = applyRecitation(s0, analysisFor({ ayahs: [result(1, "needs-review", 0.4)] }), T, "rec_conf");
  const failed = s1.progress["67:1"];
  assert.equal(failed.status, "weak");
  assert.equal(failed.weakBy, "recitation");
  const r = applySelfReview(failed, "solid", new Date(T.getTime() + 30_000));
  assert.equal(r.outcome, "recitation-today");
  assert.deepEqual(r.progress, failed);
  const viaRange = applySelfReviewRange(s1, { surah: 67, from: 1, to: 1 }, "solid", new Date(T.getTime() + 30_000));
  assert.deepEqual(viaRange.state.progress["67:1"], failed);
  assert.equal(viaRange.counts["recitation-today"], 1);
});

test("a confirmed-correct recitation today also decides the day (no self-review on top)", () => {
  const s1 = applyRecitation(stateOf(due()), analysisFor({ ayahs: [result(1, "mastered", 1)] }), T, "rec_ok");
  assert.equal(applySelfReview(s1.progress["67:1"], "forgot", new Date(T.getTime() + 30_000)).outcome, "recitation-today");
});

test("a confirmed recitation AFTER a self-review still works normally and supersedes it", () => {
  const selfed = applySelfReview(due(), "forgot", T).progress; // weak (self), selfBefore stored
  assert.ok(selfed.selfBefore);
  const later = new Date(T.getTime() + 3_600_000);
  const rec = recordOutcome(selfed, 67, 1, { accuracy: 0.97, mistakes: 0, recId: "rec_after" }, later);
  assert.equal(rec.status, "memorized"); // a passing recitation clears the self-weakness
  assert.equal(rec.weakBy, undefined);
  assert.equal(rec.selfBefore, undefined);
  assert.deepEqual(rec.recent?.map((e) => e.recId), ["rec_after"]);
  assert.equal(rec.successCount, selfed.successCount + 1);
  // and recitation-vs-self pass through the same scheduler math as before
  const direct = applyReview({ ...due(), ...{ status: "weak", weakBy: "self" as const } }, { accuracy: 0.97, mistakes: 0 }, later);
  assert.equal(direct.weakBy, undefined);
});

test("uncertain / poor / practice-only recognition: self-assessment is offered; confirmed outcomes are not", () => {
  const mixed = analysisFor({ ayahs: [result(1, "mastered", 1), result(2, "needs-review", 0.4), result(3, "uncertain", 0)] });
  assert.deepEqual(selfAssessable(mixed), ["67:3"], "only the ayah the recitation could not decide");
  const poor = analysisFor({ recognition: "poor", learningEligible: false, ayahs: [result(1, "uncertain", 0), result(2, "uncertain", 0)] });
  assert.deepEqual(selfAssessable(poor), ["67:1", "67:2"]);
  const practice = analysisFor({ learningEligible: false, ayahs: [result(1, "mastered", 1), result(2, "needs-review", 0.5)] });
  assert.deepEqual(selfAssessable(practice), ["67:1", "67:2"], "an unvalidated recognizer decided nothing");
});

// ── range reducer, activity, queue ───────────────────────────────────────

test("a whole ReviewCard range is assessed at once; activity counts only credited ayahs", () => {
  const s0 = stateOf(due({}, 1), due({}, 2), due({}, 3));
  const s1 = applySelfReviewRange(s0, { surah: 67, from: 1, to: 3 }, "solid", T);
  assert.equal(s1.counts.credited, 3);
  assert.equal(s1.state.activity.find((a) => a.reviewed)?.reviewed, 3);
  assert.equal(s1.state.activity.find((a) => a.reviewed)?.recitations, 0, "not a recitation");
  const s2 = applySelfReviewRange(s1.state, { surah: 67, from: 1, to: 3 }, "solid", new Date(T.getTime() + 60_000));
  assert.equal(s2.counts["same-day"], 3);
  assert.equal(s2.state.activity.find((a) => a.reviewed)?.reviewed, 3, "repeats add nothing");
  assert.equal(s2.state, s1.state, "no state change at all");
});

test("review queue: a self-reviewed ayah leaves today's due list; a self-reviewed weak ayah stays 'weak' in progress counts", () => {
  const rows = [due({}, 1), { ...due({}, 5), status: "weak" as const }];
  const before = buildReviewQueue(rows, T);
  assert.deepEqual(before.map((i) => i.bucket).sort(), ["today", "weak"]);
  const after = rows.map((p) => applySelfReview(p, "solid", T).progress);
  const q = buildReviewQueue(after, T);
  assert.ok(q.every((i) => i.bucket !== "today" && i.bucket !== "weak"), JSON.stringify(q.map((i) => i.bucket)));
  const recWeak = { ...recitationWeak(), nextReviewAt: T.toISOString() };
  const afterW = applySelfReview(recWeak, "solid", T).progress;
  // the recitation-origin schedule is untouched, so it stays due until a valid recitation clears it
  assert.equal(buildReviewQueue([afterW], T)[0].bucket, "weak");
  assert.equal(weakAyahs(stateOf(afterW)).length, 1);
  assert.equal(afterW.nextReviewAt, recWeak.nextReviewAt);
});

// ── evidence stays separated in what the UI says ─────────────────────────

test("evidence summary keeps self-assessment and confirmed recitation apart", () => {
  const rec = recordOutcome(due(), 67, 1, { accuracy: 0.9, mistakes: 0, recId: "r" }, addDays(T, -2));
  const both = applySelfReview({ ...rec, nextReviewAt: T.toISOString() }, "hesitated", T).progress;
  const e = evidenceSummary(both);
  assert.equal(e.lastSelf?.grade, "hesitated");
  assert.equal(e.lastRecitation?.passed, true);
  assert.ok(new Date(e.lastRecitation!.at) < new Date(e.lastSelf!.at));
  assert.equal(evidenceSummary(due()).lastRecitation, null);
});

test("learner-facing Arabic: separate wording, no technical vocabulary, no 'verified' claim for self-review", () => {
  assert.deepEqual(SELF_GRADES.map((g) => g.label), ["ثبتت", "ترددت", "نسيت"]);
  assert.equal(lastSelfLabel("solid"), "آخر تقييم: ذاتي — ثبتت");
  assert.match(lastRecitationLabel(T), /^آخر تسميع مؤكّد: /);
  const counts = { credited: 1, downgraded: 0, "same-day": 0, "not-due": 0, "recitation-today": 0, "not-memorized": 0 };
  const texts = [
    selfReviewMessage("solid", counts, addDays(T, 5).toISOString(), T),
    selfReviewMessage("hesitated", counts, addDays(T, 2).toISOString(), T),
    selfReviewMessage("forgot", counts, addDays(T, 1).toISOString(), T),
    ...SELF_GRADES.map((g) => g.hint),
    lastSelfLabel("forgot"),
  ];
  for (const t of texts) {
    assert.doesNotMatch(t, /STT|confidence|scheduler|evidence|verified|تحقّق منها/i, t);
  }
  assert.match(texts[0], /بعد ٥ أيام/);
});

// ── backwards compatibility / persistence ────────────────────────────────

test("legacy rows without any of the new fields load and behave", () => {
  const legacy: AyahProgress = { key: "67:1", surah: 67, ayah: 1, status: "memorized", ease: 2.3, intervalDays: 1, streak: 0, successCount: 0, mistakeCount: 0, nextReviewAt: T.toISOString() };
  const parsed = userStateSchema.parse({ ...EMPTY_STATE, progress: { "67:1": legacy } });
  assert.deepEqual(parsed.progress["67:1"], legacy);
  const r = applySelfReview(parsed.progress["67:1"] as AyahProgress, "solid", T);
  assert.equal(r.outcome, "credited");
  assert.equal(r.progress.selfStreak, 1);
});

test("the server schema keeps the self-review fields (otherwise they would be stripped on save)", () => {
  const rich = applySelfReview(due(), "forgot", T).progress;
  assert.ok(rich.selfReviews && rich.selfBefore && rich.weakBy);
  const parsed = userStateSchema.parse(JSON.parse(JSON.stringify({ ...EMPTY_STATE, progress: { [rich.key]: rich } })));
  assert.deepEqual(parsed.progress[rich.key], rich);
});

test("the range reducer reports when a confirmed recitation difference survives the self-assessment", () => {
  const w = { ...recitationWeak(), nextReviewAt: T.toISOString() };
  const r = applySelfReviewRange(stateOf(w), { surah: 67, from: 1, to: 1 }, "solid", T);
  assert.equal(r.stillNeedsRecitation, 1);
  const msg = selfReviewMessage("solid", r.counts, r.state.progress["67:1"].nextReviewAt ?? null, T, r.stillNeedsRecitation);
  assert.match(msg, /تسميع ناجح/);
  assert.match(msg, /لم يتغيّر موعد/, "the schedule is unchanged and the message says so");
  assert.doesNotMatch(msg, /بارك الله/, "never congratulates a pass that did not happen");
  const plain = applySelfReviewRange(stateOf(due()), { surah: 67, from: 1, to: 1 }, "solid", T);
  assert.equal(plain.stillNeedsRecitation, 0);
});

// ── invariant: self evidence may make a recitation-origin weakness more conservative, never less ────────

/** A recitation-weak ayah with a given schedule (days until it is due, from T). */
const recWeakDueIn = (days: number, intervalDays = 1): AyahProgress => ({
  ...recitationWeak(),
  intervalDays,
  nextReviewAt: addDays(T, days).toISOString(),
});

test("INVARIANT: ثبتت on a recitation-weak ayah records the review but leaves the recitation schedule exactly as it was", () => {
  for (const [days, interval] of [[0, 1], [-3, 1], [1, 1], [4, 4]] as const) {
    const w = recWeakDueIn(days, interval);
    const r = applySelfReview(w, "solid", T);
    assert.equal(r.outcome, "credited", "the review interaction is completed and recorded");
    const p = r.progress;
    assert.equal(p.intervalDays, w.intervalDays, "interval not increased");
    assert.equal(p.nextReviewAt, w.nextReviewAt, "nextReviewAt not postponed");
    assert.equal(p.ease, w.ease, "ease not increased");
    assert.equal(p.streak, w.streak, "streak not increased");
    assert.equal(p.selfStreak, w.selfStreak, "self streak not increased");
    assert.equal(p.status, "weak", "weakness not cleared or softened");
    assert.equal(p.weakBy, "recitation");
    assert.equal(evidenceOf(p), evidenceOf(w), "recitation evidence untouched");
    assert.deepEqual(p.selfReviews, [{ at: T.toISOString(), grade: "solid", source: "self" }], "self-review history recorded");
    assert.equal(p.lastReviewedAt, T.toISOString(), "reviewed today");
  }
});

test("INVARIANT: ثبتت repeated on a recitation-weak ayah never improves anything, on any day", () => {
  let p = recWeakDueIn(0);
  const original = { interval: p.intervalDays, next: p.nextReviewAt, ease: p.ease, streak: p.streak };
  for (let day = 0; day < 10; day++) {
    p = applySelfReview(p, "solid", addDays(T, day)).progress;
    assert.equal(p.intervalDays, original.interval);
    assert.equal(p.nextReviewAt, original.next);
    assert.equal(p.ease, original.ease);
    assert.equal(p.streak, original.streak);
    assert.equal(p.status, "weak");
    assert.equal(p.weakBy, "recitation");
    assert.equal(isMastered(p), false);
  }
});

test("INVARIANT: ترددت / نسيت on a recitation-weak ayah may only bring the review closer, never later", () => {
  for (const [days, interval] of [[0, 1], [-2, 1], [1, 1], [5, 5], [20, 20]] as const) {
    const w = recWeakDueIn(days, interval);
    for (const g of ["hesitated", "forgot"] as SelfGrade[]) {
      const p = applySelfReview(w, g, T).progress;
      assert.ok(p.intervalDays <= w.intervalDays, `${g} interval ${p.intervalDays} ≤ ${w.intervalDays}`);
      assert.ok(p.nextReviewAt! <= w.nextReviewAt!, `${g}: next ${p.nextReviewAt} not later than ${w.nextReviewAt}`);
      assert.ok(p.ease <= w.ease, `${g}: ease never rises`);
      assert.equal(p.status, "weak");
      assert.equal(p.weakBy, "recitation", `${g}: origin never overwritten`);
      assert.equal(evidenceOf(p), evidenceOf(w));
    }
  }
  // …and when the recitation schedule is far away, they do pull it in
  const far = recWeakDueIn(20, 20);
  assert.equal(applySelfReview(far, "forgot", T).progress.nextReviewAt, addDays(T, 1).toISOString(), "نسيت → tomorrow");
  assert.equal(applySelfReview(far, "forgot", T).progress.intervalDays, 1);
  assert.equal(applySelfReview(far, "hesitated", T).progress.intervalDays, 10);
  // and when it is already due sooner than tomorrow, نسيت does not postpone it to tomorrow
  const overdue = recWeakDueIn(-2, 1);
  assert.equal(applySelfReview(overdue, "forgot", T).progress.nextReviewAt, overdue.nextReviewAt);
});

test("INVARIANT (same-day correction): ثبتت then نسيت on a recitation-weak ayah ends exactly like نسيت alone", () => {
  const w = recWeakDueIn(3, 3);
  const solid = applySelfReview(w, "solid", T).progress;
  const corrected = applySelfReview(solid, "forgot", new Date(T.getTime() + 60_000));
  assert.equal(corrected.outcome, "downgraded");
  const direct = applySelfReview(w, "forgot", new Date(T.getTime() + 60_000)).progress;
  for (const k of ["ease", "intervalDays", "status", "weakBy", "nextReviewAt", "streak", "selfStreak"] as const) assert.equal(corrected.progress[k], direct[k], k);
});

test("INVARIANT at reducer level: the range reducer keeps a recitation-origin schedule intact for ثبتت and still counts the review as done", () => {
  const w = recWeakDueIn(0, 1);
  const r = applySelfReviewRange(stateOf(w), { surah: 67, from: 1, to: 1 }, "solid", T);
  assert.equal(r.counts.credited, 1);
  assert.equal(r.stillNeedsRecitation, 1);
  assert.equal(r.state.progress["67:1"].nextReviewAt, w.nextReviewAt);
  assert.equal(r.state.progress["67:1"].intervalDays, w.intervalDays);
  assert.equal(r.state.activity.find((a) => a.reviewed)?.reviewed, 1, "the review is recorded for today");
});

test("self-origin weakness is unaffected: ثبتت there still moves the schedule and clears it", () => {
  const selfWeak = { ...due(), status: "weak" as const, weakBy: "self" as const };
  const p = applySelfReview(selfWeak, "solid", T).progress;
  assert.equal(p.status, "memorized");
  assert.ok(p.nextReviewAt! > T.toISOString());
});
