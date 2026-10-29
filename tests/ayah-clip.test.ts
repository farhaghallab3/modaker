/** Ayah files: the silence at both ends is found, and a short breath is kept around the voice. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { clipTimes, voiceBounds } from "../src/lib/quran/ayah-clip";

const rate = 8000;
function file(silenceBefore: number, voice: number, silenceAfter: number): Float32Array {
  const n = Math.round((silenceBefore + voice + silenceAfter) * rate);
  const s = new Float32Array(n);
  const a = Math.round(silenceBefore * rate);
  const b = a + Math.round(voice * rate);
  for (let k = 0; k < n; k++) s[k] = k >= a && k < b ? 0.5 * Math.sin(k / 3) : (k % 7) * 0.0003; // faint hiss outside the voice
  return s;
}

test("the voice is found between the silences", () => {
  const b = voiceBounds(file(0.6, 2, 0.9), rate)!;
  assert.ok(Math.abs(b.first - 0.6) <= 0.021, `first ${b.first}`);
  assert.ok(Math.abs(b.last - 2.6) <= 0.021, `last ${b.last}`);
  const t = clipTimes(b, 3.5);
  assert.ok(Math.abs(t.start - 0.52) < 0.03);
  assert.ok(Math.abs(t.end! - 2.9) < 0.03);
});

test("all silence: the whole file plays", () => {
  assert.equal(voiceBounds(new Float32Array(rate), rate), null);
  assert.deepEqual(clipTimes(null, 1), { start: 0, end: null });
});
