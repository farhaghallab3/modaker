/**
 * Dashboard ↔ recitation coherence. Reproduces the audited real state: Al-Fatihah 1–7 memorized and
 * Al-Ikhlas fragmented (1 and 3–4 memorized by recall, 2 still learning), with a stale resume pointer.
 * The learner's memorization is ALL memorized ranges — the "current surah" is only a pointer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { continuation, declareMemorized, isMemorized, memorizationOverview, nextToMemorize, recordOutcome } from "../src/lib/review/learning";
import { memorizedRanges } from "../src/lib/recitation/ranges";
import { memorizedCount, todaysWird, weakAyahs } from "../src/lib/store/selectors";
import { EMPTY_STATE, type UserState } from "../src/lib/store/state";
import type { AyahProgress } from "../src/lib/types";

const T = (d: number) => new Date(Date.UTC(2026, 9, d, 10));

/** The audited shape. Fatiha declared (older), Ikhlas demonstrated by recitation (newer). */
function audited(extra: Partial<UserState> = {}): UserState {
  const progress: Record<string, AyahProgress> = {};
  for (let a = 1; a <= 7; a++) progress[`1:${a}`] = declareMemorized(undefined, 1, a, T(1));
  for (const a of [1, 3, 4]) progress[`112:${a}`] = recordOutcome(undefined, 112, a, { accuracy: 0.9, mistakes: 0 }, T(5));
  progress["112:2"] = recordOutcome(undefined, 112, 2, { accuracy: 0.4, mistakes: 3 }, T(5));
  return { ...EMPTY_STATE, progress, resume: { surah: 1, ayah: 7, mode: "memorize" } as UserState["resume"], ...extra };
}

test("both surahs appear in the overview; Al-Ikhlas is not hidden by the current surah", () => {
  const ov = memorizationOverview(audited());
  assert.deepEqual(ov.map((o) => o.surah), [1, 112]);
  const ikhlas = ov.find((o) => o.surah === 112)!;
  assert.equal(ikhlas.memorized, 3);
  assert.equal(ikhlas.total, 4);
  assert.equal(ikhlas.learning, 1, "ayah 2 was attempted but not shown to be memorized: tracked, not counted");
  assert.deepEqual(ikhlas.ranges, [{ from: 1, to: 1 }, { from: 3, to: 4 }], "fragmented ranges are preserved, not merged");
  assert.equal(ikhlas.complete, false);
  assert.equal(ov.find((o) => o.surah === 1)!.complete, true);
});

test("overview ranges equal the ranges /recite offers as «محفوظاتك» (one source of truth)", () => {
  const s = audited();
  const fromOverview = memorizationOverview(s).flatMap((o) => o.ranges.map((r) => ({ surah: o.surah, ...r })));
  const fromRecite = memorizedRanges(Object.values(s.progress)).map((r) => ({ surah: r.surah, from: r.from, to: r.to }));
  assert.deepEqual(fromOverview, fromRecite);
});

test("every overview number reconciles with the global counts", () => {
  const s = audited();
  const ov = memorizationOverview(s);
  assert.equal(ov.reduce((n, o) => n + o.memorized, 0), memorizedCount(s), "sum of per-surah memorized = الآيات المحفوظة");
  assert.equal(memorizedCount(s), Object.values(s.progress).filter(isMemorized).length);
  assert.equal(ov.reduce((n, o) => n + o.weak, 0), weakAyahs(s).length);
});

test("a stale resume pointer on a COMPLETE surah moves on to where the learner actually works", () => {
  const s = audited(); // resume says Fatiha:7 (complete)
  const c = continuation(s);
  assert.equal(c.kind, "complete");
  assert.deepEqual(c.kind === "complete" ? c.next : null, { surah: 112, ayah: 2 }, "the most recently worked unfinished surah, at its first gap");
  assert.deepEqual(nextToMemorize(s), { surah: 112, ayah: 2 });
});

test("with no stored resume, continuation still finds the unfinished surah (no 'nothing here')", () => {
  const c = continuation(audited({ resume: null as unknown as UserState["resume"] }));
  assert.deepEqual(c.kind === "continue" ? [c.surah, c.ayah] : null, [112, 2]);
});

test("the goal surah wins over recency when it still has work", () => {
  const s = audited({ goals: { ...EMPTY_STATE.goals, targetSurah: 2 } });
  const c = continuation(s);
  assert.deepEqual(c.kind === "complete" ? c.next : null, { surah: 2, ayah: 1 });
});

test("a stored resume inside Al-Ikhlas continues at its first unmemorized ayah, not at the pointer", () => {
  const c = continuation(audited({ resume: { surah: 112, ayah: 1, mode: "memorize" } as UserState["resume"] }));
  assert.deepEqual(c.kind === "continue" ? [c.surah, c.ayah] : null, [112, 2]);
});

test("completing the missing ayah completes the surah and removes the 'learning' fragment", () => {
  const s = audited();
  const done = recordOutcome(s.progress["112:2"], 112, 2, { accuracy: 0.95, mistakes: 0 }, T(6));
  const after = memorizationOverview({ progress: { ...s.progress, "112:2": done } }).find((o) => o.surah === 112)!;
  assert.equal(after.complete, true);
  assert.equal(after.learning, 0);
  assert.deepEqual(after.ranges, [{ from: 1, to: 4 }]);
});

test("the wird never points at an already-memorized ayah", () => {
  const w = todaysWird(audited());
  if (w) for (let a = w.from; a <= w.to; a++) assert.equal(isMemorized(audited().progress[`${w.surah}:${a}`]), false);
});

test("overview does not mutate or invent state: unknown surahs never appear, an empty state is empty", () => {
  assert.deepEqual(memorizationOverview(EMPTY_STATE), []);
  assert.equal(memorizationOverview(audited()).some((o) => o.surah === 2), false);
});
