/**
 * The learning model: completion ≠ review state ≠ mastery, resume as a derived continuation, and the
 * loop memorization → recitation result → per-ayah weakness → review scheduling → dashboard → next
 * recitation → updated state. Includes a reproduction of the real state that exposed the problems.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  continuation,
  declareMemorized,
  isMastered,
  isMemorized,
  isWeak,
  latestAccuracy,
  nextToMemorize,
  recitationAccuracy,
  recordOutcome,
  startAyahFor,
  surahCompletion,
} from "../src/lib/review/learning";
import { buildReviewQueue } from "../src/lib/review/scheduler";
import { applyMarkMemorized, applyRecitation } from "../src/lib/store/reducers";
import { averageAccuracy, memorizedCount, reviewQueue, strongAyahs, surahProgress, todaysWird, weakAyahs } from "../src/lib/store/selectors";
import { EMPTY_STATE, type UserState } from "../src/lib/store/state";
import type { AyahProgress, RecitationAnalysis } from "../src/lib/types";
import { userStateSchema } from "../src/server/user/schema";

const T0 = new Date("2026-10-05T12:00:00.000Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function stateWith(rows: AyahProgress[], extra: Partial<UserState> = {}): UserState {
  return { ...EMPTY_STATE, progress: Object.fromEntries(rows.map((r) => [r.key, r])), ...extra };
}

/** Al-Fatihah (7 ayahs): all declared memorized. */
function fatihahDeclared(): Record<string, AyahProgress> {
  const progress: Record<string, AyahProgress> = {};
  for (let a = 1; a <= 7; a++) progress[`1:${a}`] = declareMemorized(undefined, 1, a, T0);
  return progress;
}

function analysis(surah: number, results: [number, number][], accuracyOverall = 0.5): RecitationAnalysis {
  return {
    range: { surah, from: results[0][0], to: results[results.length - 1][0] },
    accuracy: accuracyOverall,
    ayahs: results.map(([ayah, accuracy]) => ({
      key: `${surah}:${ayah}`,
      ayah,
      accuracy,
      status: accuracy >= 0.97 ? "mastered" : accuracy >= 0.5 ? "needs-review" : "missed",
      words: [],
      mistakes: accuracy < 1 ? [{ type: "incorrect", ayahKey: `${surah}:${ayah}`, expected: "x", heard: "y" }] : [],
    })),
    mistakes: [],
    extraWords: [],
    uncertainWords: 0,
    transcript: { text: "x", provider: "test", language: "ar-SA" },
    textOnly: true,
  };
}

// ── 1–3. completion, review state and mastery are different things ───────

test("7/7 memorized with weak ayahs: 100% COMPLETION, 2 ayahs to review, 0 mastered", () => {
  let s = stateWith(Object.values(fatihahDeclared()));
  s = applyRecitation(s, analysis(1, [[6, 0.333], [7, 0.333]]), at(0), "rec_a");
  const c = surahCompletion(s, 1);
  assert.deepEqual([c.memorized, c.total, c.ratio, c.complete], [7, 7, 1, true]);
  assert.equal(c.weak, 2, "review state is separate from completion");
  assert.equal(c.mastered, 0, "100% complete is not 100% mastered");
  assert.equal(memorizedCount(s), 7);
  assert.deepEqual(weakAyahs(s).map((p) => p.key).sort(), ["1:6", "1:7"]);
  assert.equal(surahProgress(s, 1).weak, 2, "the page-level selector exposes the same separation");
});

test("a fully memorized surah can legitimately have review items, and they are queued", () => {
  let s = stateWith(Object.values(fatihahDeclared()));
  s = applyRecitation(s, analysis(1, [[6, 0.4], [7, 0.6]]), at(0));
  const queue = reviewQueue(s, at(0));
  const weakItems = queue.filter((r) => r.bucket === "weak");
  assert.equal(weakItems.length, 1, "weak ayahs 6–7 form one contiguous weak range");
  assert.deepEqual([weakItems[0].from, weakItems[0].to], [6, 7]);
  assert.equal(surahCompletion(s, 1).complete, true, "being in review does not undo completion");
});

test("100% completion with less than 100% mastery: accuracy is a separate, evidence-based number", () => {
  let s = stateWith(Object.values(fatihahDeclared()));
  assert.equal(recitationAccuracy(s), null, "no recitation evidence → no accuracy and no mastery number is invented");
  s = applyRecitation(s, analysis(1, [[2, 1], [3, 1], [6, 0.5]]), at(0));
  const acc = recitationAccuracy(s)!;
  assert.equal(acc.ayahs, 3, "only ayahs that were actually recited count");
  assert.ok(Math.abs(acc.value - (1 + 1 + 0.5) / 3) < 1e-9, "mean of the LATEST outcome of each recited ayah");
  assert.ok(acc.value < 1);
  assert.equal(strongAyahs(s).length, 0, "one perfect recitation is not mastery");
  assert.equal(averageAccuracy(s), acc.value);
});

test("memorized is not mastered: mastery needs repeated, spaced, accurate recitations", () => {
  let p = declareMemorized(undefined, 1, 1, T0);
  const days = [1, 3, 8, 22];
  days.forEach((d, i) => {
    p = recordOutcome(p, 1, 1, { accuracy: 1, mistakes: 0 }, at(d));
    assert.equal(isMastered(p), i === days.length - 1, `after ${i + 1} good recitation(s)`);
    assert.equal(isMemorized(p), true);
  });
});

// ── 4. resume / continuation ─────────────────────────────────────────────

test("completed surah: a stale resume pointer does not claim the learner 'stopped' at ayah 2", () => {
  const s = stateWith(Object.values(fatihahDeclared()), { resume: { surah: 1, ayah: 2, mode: "memorize", updatedAt: T0.toISOString() } });
  const c = continuation(s);
  assert.equal(c.kind, "complete");
  assert.equal(nextToMemorize(s), null);
  assert.equal(todaysWird(s), null, "no 'today's wird' of already-memorized ayahs");
});

test("completed surah moves on to the goal surah when it still has work", () => {
  const s = stateWith(Object.values(fatihahDeclared()), {
    resume: { surah: 1, ayah: 7, mode: "memorize", updatedAt: T0.toISOString() },
    goals: { ...EMPTY_STATE.goals, targetSurah: 112 },
  });
  const c = continuation(s);
  assert.deepEqual(c, { kind: "complete", surah: 1, next: { surah: 112, ayah: 1 } });
  assert.deepEqual(todaysWird(s), { surah: 112, from: 1, to: 4 });
});

test("a stale pointer heals itself: continuation is the first ayah that is not yet memorized", () => {
  const p = [1, 2, 3].map((a) => declareMemorized(undefined, 1, a, T0));
  const s = stateWith(p, { resume: { surah: 1, ayah: 2, mode: "memorize", updatedAt: T0.toISOString() } });
  assert.deepEqual(continuation(s), { kind: "continue", surah: 1, ayah: 4, mode: "memorize" });
  assert.equal(startAyahFor(s, 1), 4);
});

test("a gap before the stored position is returned when nothing remains after it", () => {
  const p = [1, 2, 4, 5, 6, 7].map((a) => declareMemorized(undefined, 1, a, T0));
  const s = stateWith(p, { resume: { surah: 1, ayah: 6, mode: "memorize", updatedAt: T0.toISOString() } });
  assert.deepEqual(continuation(s), { kind: "continue", surah: 1, ayah: 3, mode: "memorize" });
});

test("weak ayahs do not block completion or move the continuation (they are review, not unfinished)", () => {
  let s = stateWith(Object.values(fatihahDeclared()), { resume: { surah: 1, ayah: 3, mode: "memorize", updatedAt: T0.toISOString() } });
  s = applyRecitation(s, analysis(1, [[3, 0.2]]), at(0));
  assert.equal(continuation(s).kind, "complete");
});

test("no resume → nothing to continue", () => {
  assert.deepEqual(continuation(stateWith([])), { kind: "none" });
  assert.equal(startAyahFor(stateWith([]), 5), 1);
});

test("marking a range memorized completes the ayahs and advances the hint; finishing the surah completes it", () => {
  let s = stateWith([]);
  s = applyMarkMemorized(s, { surah: 112, from: 1, to: 2 }, at(0));
  assert.deepEqual(continuation(s), { kind: "continue", surah: 112, ayah: 3, mode: "memorize" });
  s = applyMarkMemorized(s, { surah: 112, from: 3, to: 4 }, at(0));
  assert.equal(continuation(s).kind, "complete");
  assert.ok(s.notifications.some((n) => n.kind === "goal-complete"));
});

// ── 5. recitation changes review state — per ayah, with evidence ─────────

test("a saved recitation updates each ayah from ITS OWN result and records the evidence", () => {
  let s = stateWith(Object.values(fatihahDeclared()));
  s = applyRecitation(s, analysis(1, [[2, 1], [3, 1], [4, 1], [5, 0.75], [6, 0]], 0.75), at(0), "rec_1");
  assert.equal(isWeak(s.progress["1:6"]), true, "the ayah that was missed is weak");
  for (const a of [2, 3, 4, 5]) assert.equal(isWeak(s.progress[`1:${a}`]), false, `ayah ${a} was recited acceptably`);
  assert.equal(isWeak(s.progress["1:1"]), false, "an ayah outside the range is untouched");
  assert.equal(s.progress["1:1"].recent, undefined);
  // the evidence behind the judgement
  assert.deepEqual(s.progress["1:6"].recent?.map((e) => [e.accuracy, e.recId]), [[0, "rec_1"]]);
  assert.equal(s.recitations[0].id, "rec_1", "the evidence id points at the saved recitation summary");
  assert.equal(s.activity.at(-1)!.recitations, 1);
});

test("evidence accumulates (last 5) and the latest outcome decides the review state", () => {
  let p = declareMemorized(undefined, 1, 6, T0);
  [0, 0.333, 0.667, 0.9, 0.2, 0.667, 0.5].forEach((acc, i) => {
    p = recordOutcome(p, 1, 6, { accuracy: acc, mistakes: 1, recId: `r${i}` }, at(i));
  });
  assert.equal(p.recent!.length, 5);
  assert.deepEqual(p.recent!.map((e) => e.recId), ["r2", "r3", "r4", "r5", "r6"]);
  assert.equal(latestAccuracy(p), 0.5);
  assert.equal(isWeak(p), true);
});

// ── 6. a later successful recitation improves the state ──────────────────

test("one good recitation clears 'weak' even though the blended average is still low", () => {
  let p = declareMemorized(undefined, 1, 6, T0);
  p = recordOutcome(p, 1, 6, { accuracy: 0, mistakes: 3 }, at(0));
  p = recordOutcome(p, 1, 6, { accuracy: 0.333, mistakes: 2 }, at(1));
  p = recordOutcome(p, 1, 6, { accuracy: 0.667, mistakes: 1 }, at(2));
  assert.equal(isWeak(p), true);
  assert.ok(p.accuracy! < 0.75, "the old blended average is low");

  const before = buildReviewQueue([p], at(3)).map((r) => r.bucket);
  assert.deepEqual(before, ["weak"]);

  p = recordOutcome(p, 1, 6, { accuracy: 0.95, mistakes: 0 }, at(3));
  assert.equal(isWeak(p), false, "a successful recitation clears the weakness");
  assert.ok(p.accuracy! < 0.75, "…while the rolling average is still low");
  assert.equal(p.streak, 1);
  assert.notDeepEqual(buildReviewQueue([p], at(3)).map((r) => r.bucket), ["weak"], "it leaves the weak review bucket");
  assert.equal(latestAccuracy(p), 0.95);
  assert.ok(new Date(p.nextReviewAt!).getTime() > at(3).getTime(), "and is rescheduled into the future");
});

test("the dashboard numbers follow the model: weak count drops, accuracy follows the latest recitations", () => {
  let s = stateWith(Object.values(fatihahDeclared()));
  s = applyRecitation(s, analysis(1, [[6, 0.3], [7, 0.4]]), at(0));
  assert.equal(weakAyahs(s).length, 2);
  assert.ok(Math.abs(averageAccuracy(s)! - 0.35) < 1e-9);
  s = applyRecitation(s, analysis(1, [[6, 1], [7, 0.9]]), at(1));
  assert.equal(weakAyahs(s).length, 0);
  assert.ok(Math.abs(averageAccuracy(s)! - 0.95) < 1e-9, "mean of the latest outcomes");
  assert.equal(surahCompletion(s, 1).ratio, 1, "completion never moved");
});

// ── reciting does not silently complete ──────────────────────────────────

test("reciting an ayah that was never declared does NOT make it memorized unless the recitation shows recall", () => {
  let s = stateWith([]);
  s = applyRecitation(s, analysis(1, [[2, 0], [3, 0.5], [4, 0.9]]), at(0), "rec_x");
  assert.equal(s.progress["1:2"].status, "learning");
  assert.equal(s.progress["1:3"].status, "learning");
  assert.equal(isMemorized(s.progress["1:4"]), true, "demonstrated recall (≥ 75 %) counts");
  assert.equal(surahCompletion(s, 1).memorized, 1, "a failed attempt is not 'memorized'");
  assert.equal(weakAyahs(s).length, 0, "learning ayahs are not weak review items");
  assert.deepEqual(s.progress["1:2"].recent?.map((e) => e.recId), ["rec_x"], "the attempt is still recorded as evidence");
});

test("declaring a 'learning' ayah memorized keeps its recitation evidence", () => {
  let p = recordOutcome(undefined, 1, 2, { accuracy: 0.3, mistakes: 2, recId: "r1" }, at(0));
  assert.equal(isMemorized(p), false);
  p = declareMemorized(p, 1, 2, at(1));
  assert.equal(isMemorized(p), true);
  assert.deepEqual(p.recent?.map((e) => e.recId), ["r1"]);
  assert.equal(p.mistakeCount, 2);
});

// ── 7. logout / login preserves all three concepts ───────────────────────

function derived(s: UserState) {
  const c = surahCompletion(s, 1);
  return {
    completion: [c.memorized, c.total, c.complete],
    weak: weakAyahs(s).map((p) => p.key),
    mastered: strongAyahs(s).map((p) => p.key),
    accuracy: averageAccuracy(s),
    continuation: continuation(s),
    queue: reviewQueue(s, at(0)).map((r) => [r.bucket, r.from, r.to]),
  };
}

test("persistence round trip (what the server stores and returns) preserves completion, review state and mastery", () => {
  let s = stateWith(Object.values(fatihahDeclared()), { resume: { surah: 1, ayah: 2, mode: "memorize", updatedAt: T0.toISOString() } });
  s = applyRecitation(s, analysis(1, [[2, 1], [3, 1], [4, 1], [5, 0.75], [6, 0]]), at(0), "rec_1");
  s = applyRecitation(s, analysis(1, [[6, 0.667], [7, 0.333]]), at(0), "rec_2");
  s = { ...s, profile: null };

  const wire = JSON.parse(JSON.stringify(s)); // exactly what PUT sends and GET returns
  const restored = userStateSchema.parse(wire) as unknown as UserState;

  assert.deepEqual(restored.progress, s.progress, "no field is stripped — including the per-ayah evidence");
  assert.deepEqual(restored.resume, s.resume);
  assert.deepEqual(derived({ ...s, ...restored } as UserState), derived(s));
  const d = derived(s);
  assert.deepEqual(d.completion, [7, 7, true]);
  assert.deepEqual(d.weak, ["1:6", "1:7"]);
  assert.deepEqual(d.mastered, []);
  assert.equal(restored.progress["1:6"].recent?.length, 2);
});

// ── the real state that exposed the problem ──────────────────────────────

/** Persisted values of the audited account (Al-Fatihah) — see docs/LEARNING-MODEL.md §6. */
function auditedRow(a: number, o: Partial<AyahProgress>): AyahProgress {
  return {
    key: `1:${a}`, surah: 1, ayah: a, status: "memorized", ease: 2.4, intervalDays: 1, streak: 1, successCount: 1, mistakeCount: 0, accuracy: 1,
    memorizedAt: "2026-10-05T19:22:24.987Z", lastReviewedAt: "2026-10-05T19:22:24.987Z", nextReviewAt: "2026-10-06T19:22:24.987Z", ...o,
  };
}

test("the audited state: 7/7 completion, 2 weak, resume stale at 2 → now reads as 'complete', not 'stopped at ayah 2'", () => {
  const rows = [
    auditedRow(1, { streak: 0, successCount: 0, accuracy: undefined, lastReviewedAt: undefined, memorizedAt: "2026-10-05T15:35:59.965Z" }),
    auditedRow(2, {}),
    auditedRow(3, {}),
    auditedRow(4, {}),
    auditedRow(5, { accuracy: 0.75, mistakeCount: 1, ease: 2.16 }),
    auditedRow(6, { status: "weak", accuracy: 0.346, streak: 0, successCount: 0, mistakeCount: 6, ease: 1.3 }),
    auditedRow(7, { status: "weak", accuracy: 0.466, streak: 0, successCount: 0, mistakeCount: 9, ease: 1.44 }),
  ];
  const s = stateWith(rows, { resume: { surah: 1, ayah: 2, mode: "memorize", updatedAt: "2026-10-05T19:21:41.092Z" } });

  const c = surahCompletion(s, 1);
  assert.deepEqual([c.memorized, c.total, c.ratio, c.weak, c.mastered, c.complete], [7, 7, 1, 2, 0, true]);
  assert.equal(continuation(s).kind, "complete", "the stale resume (ayah 2) no longer says the learner stopped there");
  assert.equal(todaysWird(s), null);
  // legacy rows carry no per-ayah evidence, so the stored rolling value is the best available (6 recited ayahs)
  const acc = recitationAccuracy(s)!;
  assert.equal(acc.ayahs, 6, "ayah 1 has no recitation evidence and is not averaged in");
  assert.ok(Math.abs(acc.value - (1 + 1 + 1 + 0.75 + 0.346 + 0.466) / 6) < 1e-9);
  assert.deepEqual(weakAyahs(s).map((p) => p.key).sort(), ["1:6", "1:7"]);
});
