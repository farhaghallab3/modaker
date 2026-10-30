/** Whole-surah recordings: timings are checked before use, and ayah 1 starts at the very beginning (with the basmala). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ayahStart, hasSurahAudio, parseTimings, surahAudioUrl } from "../src/lib/quran/surah-audio";
import { RECITERS } from "../src/lib/quran/reciters";

const row = (ayah: number, s: number, e: number) => ({ ayah, start_time: s, end_time: e, page: "x" });

test("timings in ms become seconds; ayah 1 starts at 0", () => {
  const t = parseTimings([row(1, 3320, 12380), row(2, 12380, 31200), row(3, 31200, 34240)], 3, "u");
  assert.deepEqual(t?.ayahs[1], { start: 12.38, end: 31.2 });
  assert.equal(ayahStart(t!, 1), 0);
  assert.equal(ayahStart(t!, 3), 31.2);
});

test("timings that do not cover every ayah in order are refused", () => {
  assert.equal(parseTimings([row(1, 0, 10), row(2, 10, 20)], 3, "u"), null); // missing ayah
  assert.equal(parseTimings([row(1, 0, 10), row(3, 10, 20), row(2, 20, 30)], 3, "u"), null); // out of order
  assert.equal(parseTimings([row(1, 0, 10), row(2, 10, 5), row(3, 20, 30)], 3, "u"), null); // ends before it starts
  assert.equal(parseTimings({ error: "x" }, 3, "u"), null);
});

test("every reciter in the app plays continuously from a whole-surah recording", () => {
  for (const r of RECITERS) assert.ok(hasSurahAudio(r.id), r.id);
  assert.equal(surahAudioUrl("qatami", 18), "https://cdn.mp3quran.net/audio/nasser-qatami/r1/018.mp3");
  assert.equal(surahAudioUrl("husary-muallim", 18), null);
});
