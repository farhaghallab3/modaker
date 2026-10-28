/**
 * Tajweed notes from the free checker (services/tajweed): validation of its answer, the fixed Arabic sentences,
 * the server client and the route. No network: the checker is faked. Synthetic words only, no Quran text.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/v1/recitation/tajweed/route";
import { checkTajweed, tajweedConfigured } from "../src/server/tajweed";
import { ProviderError } from "../src/server/errors";
import { rateLimiter } from "../src/server/rate-limit";
import { TAJWEED_RULES, noteWord, parseTajweedResult, tajweedNoteText, type TajweedNote } from "../src/lib/recitation/tajweed-notes";
import { TEACHER_PHRASES } from "../src/lib/recitation/coach-feedback";

const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const range = { surah: 2, from: 3, to: 5 };

beforeEach(() => {
  for (const k of ["TAJWEED_URL", "TAJWEED_KEY"]) saved[k] = process.env[k];
  process.env.TAJWEED_URL = "https://checker.test/";
  process.env.TAJWEED_KEY = "k-123";
  rateLimiter.reset();
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = realFetch;
});

const note = (o: Partial<TajweedNote> = {}): TajweedNote => ({
  ayah: 3,
  word: 1,
  wordsInAyah: 4,
  kind: "tajweed",
  op: "replace",
  rule: "madd_lazem",
  expectedLen: 6,
  heardLen: 3,
  ...o,
});

test("parse keeps only well-formed notes inside the requested ayahs, in reading order", () => {
  const raw = {
    matched: 2,
    notes: [
      note({ ayah: 5, word: 0 }),
      note({ ayah: 3, word: 2, kind: "letters", rule: null, expectedLen: null, heardLen: null, op: "delete" }),
      note({ ayah: 9 }), // outside the range
      note({ word: 4 }), // word index past the ayah
      { ...note(), rule: "made_up" },
      { ...note(), kind: "style" },
      { ...note(), rule: null }, // a tajweed note must name its rule
      { ...note(), expectedLen: "6" },
      "junk",
    ],
  };
  const r = parseTajweedResult(raw, range);
  assert.equal(r.matched, 2);
  assert.deepEqual(
    r.notes.map((n) => [n.ayah, n.word, n.kind]),
    [
      [3, 2, "letters"],
      [5, 0, "tajweed"],
    ],
  );
  assert.deepEqual(parseTajweedResult(null, range), { notes: [], matched: 0 });
  assert.equal(parseTajweedResult({ notes: Array.from({ length: 30 }, (_, i) => note({ word: i % 4 })) }, range).notes.length, 12);
});

test("each note gets a clear sentence; madd counts are spelled in Arabic", () => {
  assert.equal(tajweedNoteText(note()), "المدّ اللازم: يُمدّ ٦ حركات، وسمعته نحو ٣ حركات. أطِل المدّ.");
  assert.match(tajweedNoteText(note({ rule: "madd_tabii", expectedLen: 2, heardLen: 1 })), /يُمدّ حركتين، وسمعته نحو حركة واحدة/);
  assert.match(tajweedNoteText(note({ expectedLen: 4, heardLen: 7 })), /لا تُطِل/);
  assert.match(tajweedNoteText(note({ op: "delete", heardLen: 0 })), /لم يظهر المدّ/);
  assert.match(tajweedNoteText(note({ rule: "qalqalah", op: "missing", expectedLen: null, heardLen: null })), /القلقلة/);
  assert.match(tajweedNoteText(note({ rule: "ghunnah" })), /الغنّة/);
  assert.match(tajweedNoteText(note({ kind: "letters", op: "delete", rule: null })), /سقط/);
  assert.match(tajweedNoteText(note({ kind: "harakat", rule: null })), /حركات/);
  for (const k of Object.keys(TAJWEED_RULES)) assert.ok(tajweedNoteText(note({ rule: k as keyof typeof TAJWEED_RULES })).length > 10);
});

test("the word is shown from Modaker's own text only when both texts count the same words", () => {
  assert.equal(noteWord(note({ word: 2, wordsInAyah: 4 }), "أ ب ج د"), "ج");
  assert.equal(noteWord(note({ word: 2, wordsInAyah: 5 }), "أ ب ج د"), null);
  assert.equal(noteWord(note(), undefined), null);
});

test("teacher has fixed tajweed sentences (no Quran words)", () => {
  assert.ok(TEACHER_PHRASES.tajweedFix.includes("التجويد"));
  assert.ok(TEACHER_PHRASES.tajweedOk.includes("التجويد"));
});

test("client sends audio + range with the shared key and validates the answer", async () => {
  let seen: { url: string; key: string | null; surah: unknown; from: unknown; to: unknown; audio: unknown } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    const fd = init.body as FormData;
    seen = { url, key: new Headers(init.headers).get("x-modaker-key"), surah: fd.get("surah"), from: fd.get("from"), to: fd.get("to"), audio: fd.get("audio") };
    return new Response(JSON.stringify({ ok: true, matched: 1, notes: [note(), note({ ayah: 99 })] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await checkTajweed(new Uint8Array([1, 2, 3]).buffer, "audio/webm", range, fake);
  assert.ok(seen);
  const s = seen as unknown as { url: string; key: string; surah: string; from: string; to: string; audio: Blob };
  assert.equal(s.url, "https://checker.test/check");
  assert.equal(s.key, "k-123");
  assert.deepEqual([s.surah, s.from, s.to], ["2", "3", "5"]);
  assert.equal(s.audio.size, 3);
  assert.equal(r.notes.length, 1);

  const down = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(checkTajweed(new ArrayBuffer(3), "audio/webm", range, down), ProviderError);
});

const form = (rangeJson = JSON.stringify(range)) => {
  const fd = new FormData();
  fd.append("audio", new Blob([new Uint8Array(2000)], { type: "audio/webm" }), "r.webm");
  fd.append("range", rangeJson);
  return new Request("https://modaker.test/api/v1/recitation/tajweed", { method: "POST", body: fd, headers: { host: "modaker.test" } });
};

test("route: off until both TAJWEED_URL and TAJWEED_KEY are set", async () => {
  delete process.env.TAJWEED_KEY;
  assert.equal(tajweedConfigured(), false);
  const res = await POST(form(), undefined);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "tajweed_unavailable");
});

test("route: forwards to the checker and returns the notes; checker failure → 502", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ matched: 1, notes: [note()] }), { status: 200 })) as unknown as typeof fetch;
  const ok = await POST(form(), undefined);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.notes.length, 1);
  assert.equal(body.matched, 1);

  globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
  const bad = await POST(form(), undefined);
  assert.equal(bad.status, 502);

  const invalid = await POST(form("{"), undefined);
  assert.equal(invalid.status, 400);
});

test("GET says whether checking is on, and wakes the checker when it is", async () => {
  const pinged: string[] = [];
  globalThis.fetch = (async (url: string) => {
    pinged.push(url);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const on = await GET(new Request("https://modaker.test/api/v1/recitation/tajweed", { headers: { host: "modaker.test" } }), undefined);
  assert.deepEqual(await on.json(), { enabled: true });
  assert.deepEqual(pinged, ["https://checker.test/"]);

  delete process.env.TAJWEED_URL;
  pinged.length = 0;
  const off = await GET(new Request("https://modaker.test/api/v1/recitation/tajweed", { headers: { host: "modaker.test" } }), undefined);
  assert.deepEqual(await off.json(), { enabled: false });
  assert.equal(pinged.length, 0);
});
