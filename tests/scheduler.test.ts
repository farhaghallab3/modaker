import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReview, buildReviewQueue, newAyahProgress } from "../src/lib/review/scheduler";

const now = new Date("2026-10-05T08:00:00Z");

test("successful reviews grow the interval", () => {
  let p = newAyahProgress(67, 1, now);
  const intervals: number[] = [];
  for (let i = 0; i < 5; i++) {
    p = applyReview(p, { accuracy: 0.98, mistakes: 0 }, now);
    intervals.push(p.intervalDays);
  }
  assert.deepEqual(intervals.slice(0, 2), [1, 3]);
  assert.ok(intervals[4] > intervals[3] && intervals[3] > intervals[2]);
  assert.equal(p.status, "mastered");
});

test("a failed review resets to tomorrow and marks weak", () => {
  let p = newAyahProgress(19, 5, now);
  p = applyReview(p, { accuracy: 0.98, mistakes: 0 }, now);
  p = applyReview(p, { accuracy: 0.98, mistakes: 0 }, now);
  p = applyReview(p, { accuracy: 0.4, mistakes: 4 }, now);
  assert.equal(p.intervalDays, 1);
  assert.equal(p.streak, 0);
  assert.equal(p.status, "weak");
});

test("queue groups contiguous due ayahs and puts weak first", () => {
  const due = (s: number, a: number, extra = {}) => ({ ...newAyahProgress(s, a, new Date("2026-10-01")), ...extra });
  const items = buildReviewQueue(
    [due(67, 1), due(67, 2), due(67, 3), due(19, 10, { status: "weak" as const, accuracy: 0.5, mistakeCount: 3 }), due(19, 11, { status: "weak" as const, accuracy: 0.5 })],
    now,
  );
  assert.equal(items[0].surah, 19);
  assert.equal(items[0].bucket, "weak");
  assert.deepEqual([items[0].from, items[0].to], [10, 11]);
  assert.deepEqual([items[1].surah, items[1].from, items[1].to], [67, 1, 3]);
});
