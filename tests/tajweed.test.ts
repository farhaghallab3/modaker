/**
 * Tajweed notes from the free checker (services/tajweed): validation of its answer, the fixed Arabic sentences,
 * the server client and the route. No network: the checker is faked. Synthetic words only, no Quran text.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/v1/recitation/tajweed/route";
import { checkTajweed, gradioComplete, tajweedConfigured } from "../src/server/tajweed";
import { ProviderError } from "../src/server/errors";
import { rateLimiter } from "../src/server/rate-limit";
import {
  TAJWEED_RULES,
  noteWord,
  notePlace,
  parseSounds,
  parseTajweedResult,
  tajweedNoteText,
  tajweedReason,
  tajweedSpeech,
  type TajweedNote,
} from "../src/lib/recitation/tajweed-notes";
import { wordAudioUrl } from "../src/lib/quran/word-audio";
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
  letter: "",
  expected: "",
  heard: "",
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
  assert.match(tajweedNoteText(note({ kind: "harakat", rule: null })), /حركة/);
  for (const k of Object.keys(TAJWEED_RULES)) assert.ok(tajweedNoteText(note({ rule: k as keyof typeof TAJWEED_RULES })).length > 10);
});

// Letters and vowels only (phonetic script), never words: د + damma, ب doubled + kasra.
const D_DAMMA = "\u062F\u064F", D_FATHA = "\u062F\u064E", BB_KASRA = "\u0628\u0628\u0650";

test("phonetic sounds: letters with their vowel; a doubled letter is a shadda", () => {
  assert.deepEqual(parseSounds(D_DAMMA), [{ letter: "د", vowel: "\u064F", doubled: false }]);
  assert.deepEqual(parseSounds(BB_KASRA), [{ letter: "ب", vowel: "\u0650", doubled: true }]);
  assert.deepEqual(parseSounds("\u062F\u0687"), [{ letter: "د", vowel: "", doubled: false }]); // qalqalah sign is not a vowel
});

test("each harakat note says which letter and which vowel, instead of one sentence for all", () => {
  const vowel = tajweedReason(note({ kind: "harakat", rule: null, letter: "د", expected: D_DAMMA, heard: D_FATHA }));
  assert.equal(vowel.text, "حرف الدال حقّه الضم «دُ»، وسمعته مفتوحًا «دَ». أعطِه الضم واضحًا.");
  assert.equal(vowel.speech, "حرف الدال هنا حقّه الضم، وسمعته مفتوحًا. أعطِه الضم واضحًا.");
  assert.match(tajweedNoteText(note({ kind: "harakat", rule: null, expected: "\u0647\u0650", heard: "\u0647" })), /حرف الهاء حقّه الكسر .*وسمعته ساكنًا/);
  assert.match(tajweedNoteText(note({ kind: "harakat", rule: null, expected: BB_KASRA, heard: "\u0628\u0650" })), /حرف الباء هنا مشدّد/);
  assert.match(tajweedNoteText(note({ kind: "letters", rule: null, expected: "\u062D\u064E", heard: "\u0647\u064E" })), /هنا حرف الحاء «ح»، وسمعت مكانه حرف الهاء «ه»/);
  assert.match(tajweedNoteText(note({ kind: "letters", op: "delete", rule: null, expected: "\u0644\u064E" })), /سقط منك حرف اللام/);
  // different notes → different sentences
  const texts = new Set(
    [D_FATHA, "\u062F\u0650", "\u062F"].map((heard) => tajweedNoteText(note({ kind: "harakat", rule: null, expected: D_DAMMA, heard }))),
  );
  assert.equal(texts.size, 3);
});

test("the teacher's spoken lines name the place by ayah and word number, never the Quran word", () => {
  assert.equal(notePlace(note({ ayah: 2, word: 0, wordsInAyah: 4 })), "الآية الثانية، الكلمة الأولى");
  assert.equal(notePlace(note({ ayah: 3, word: 3, wordsInAyah: 4 })), "الآية الثالثة، الكلمة الأخيرة");
  assert.equal(notePlace(note({ ayah: 25, word: 11, wordsInAyah: 20 })), "الآية رقم 25، الكلمة رقم 12");
  const lines = tajweedSpeech([
    note({ ayah: 2, word: 0, kind: "harakat", rule: null, expected: D_DAMMA, heard: D_FATHA }),
    note({ ayah: 3, word: 1 }),
    note({ ayah: 4, word: 1 }),
    note({ ayah: 5, word: 1 }),
  ]);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("أولًا، في الآية الثانية، الكلمة الأولى: حرف الدال"));
  assert.ok(lines[2].startsWith("وأخيرًا،"));
  assert.match(lines[2], /بقية الملاحظات مكتوبة/);
  assert.ok(!tajweedSpeech([note()])[0].startsWith("أولًا"));
});

test("checker letters and sounds are kept only when short and Arabic", () => {
  const r = parseTajweedResult({ notes: [{ ...note(), letter: "د", expected: D_DAMMA, heard: "<script>" }] }, range);
  assert.deepEqual([r.notes[0].letter, r.notes[0].expected, r.notes[0].heard], ["د", D_DAMMA, ""]);
  assert.equal(parseTajweedResult({ notes: [{ ...note(), letter: "دد" }] }, range).notes[0].letter, "");
});

test("a word alone comes from the word-by-word audio of a human reciter", () => {
  assert.equal(wordAudioUrl(1, 3, 0), "https://audio.qurancdn.com/wbw/001_003_001.mp3");
});

test("the word is shown from Modaker's own text only when both texts count the same words", () => {
  assert.equal(noteWord(note({ word: 2, wordsInAyah: 4 }), "أ ب ج د"), "ج");
  assert.equal(noteWord(note({ word: 2, wordsInAyah: 5 }), "أ ب ج د"), null);
  assert.equal(noteWord(note(), undefined), null);
});

test("teacher has fixed tajweed sentences (no Quran words)", () => {
  assert.ok(TEACHER_PHRASES.tajweedFix.includes("التجويد"));
  assert.ok(TEACHER_PHRASES.tajweedOk.includes("التجويد"));
  assert.ok(TEACHER_PHRASES.tajweedIntro.includes("التجويد"));
  assert.ok(TEACHER_PHRASES.hearSheikh.includes("الشيخ"));
});

/** A fake Gradio Space: POST starts a job, GET returns its server-sent events. */
function fakeGradio(result: unknown, calls: { url: string; init?: RequestInit }[] = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "POST") return new Response(JSON.stringify({ event_id: "ev-1" }), { status: 200 });
    return new Response(`event: generating\ndata: null\n\nevent: complete\ndata: ${JSON.stringify([result])}\n\n`, { status: 200 });
  }) as unknown as typeof fetch;
}

test("gradio events: the complete event's data is read, an error event gives null", () => {
  assert.deepEqual(gradioComplete('event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"ok":true}]\n'), { ok: true });
  assert.equal(gradioComplete("event: error\ndata: null\n"), null);
  assert.equal(gradioComplete(""), null);
});

test("client sends audio (base64) + range + key to the Gradio API and validates the answer", async () => {
  process.env.TAJWEED_HF_TOKEN = "hf_x";
  const calls: { url: string; init?: RequestInit }[] = [];
  try {
    const r = await checkTajweed(new Uint8Array([1, 2, 3]).buffer, "audio/webm", range, fakeGradio({ ok: true, matched: 1, notes: [note(), note({ ayah: 99 })] }, calls));
    assert.equal(calls[0].url, "https://checker.test/gradio_api/call/check");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).data, ["AQID", 2, 3, 5, "k-123"]);
    assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer hf_x");
    assert.equal(calls[1].url, "https://checker.test/gradio_api/call/check/ev-1");
    assert.equal(r.notes.length, 1);
  } finally {
    delete process.env.TAJWEED_HF_TOKEN;
  }

  const down = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(checkTajweed(new ArrayBuffer(3), "audio/webm", range, down), ProviderError);
  await assert.rejects(checkTajweed(new ArrayBuffer(3), "audio/webm", range, fakeGradio({ ok: false, error: "unauthorized" })), /unauthorized/);
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
  globalThis.fetch = fakeGradio({ ok: true, matched: 1, notes: [note()] });
  const ok = await POST(form(), undefined);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.notes.length, 1);
  assert.equal(body.matched, 1);
  assert.ok("speech" in body); // signed teacher lines, or null when the voice is off

  globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
  const bad = await POST(form(), undefined);
  assert.equal(bad.status, 502);

  const invalid = await POST(form("{"), undefined);
  assert.equal(invalid.status, 400);
});

test("route: with the voice on, each spoken note comes signed (letters and numbers only)", async () => {
  const keys = ["GEMINI_API_KEY", "SESSION_SECRET", "ASSISTANT_TTS", "TTS_PROVIDER"];
  const before = keys.map((k) => process.env[k]);
  process.env.GEMINI_API_KEY = "g-test";
  process.env.SESSION_SECRET = "s".repeat(32);
  delete process.env.ASSISTANT_TTS;
  delete process.env.TTS_PROVIDER;
  try {
    globalThis.fetch = fakeGradio({ ok: true, matched: 1, notes: [note({ kind: "harakat", rule: null, expected: D_DAMMA, heard: D_FATHA }), note({ ayah: 4 })] });
    const body = await (await POST(form(), undefined)).json();
    assert.equal(body.speech.length, 2);
    assert.match(body.speech[0].text, /^أولًا، في الآية الثالثة، الكلمة الثانية: حرف الدال/);
    assert.ok(body.speech.every((p: { sig: string }) => p.sig.length > 16));
  } finally {
    keys.forEach((k, i) => (before[i] === undefined ? delete process.env[k] : (process.env[k] = before[i])));
  }
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
