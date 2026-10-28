/**
 * The teacher's spoken feedback after a recitation: fixed sentences with ayah numbers only, never Quran words.
 * Synthetic words only — no Quran text.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ayahNumbers, ayahsNotRecited, ayahsToRepeat, ayahsUnsure, recitationFeedbackText, TEACHER_PHRASES, teacherFeedback } from "../src/lib/recitation/coach-feedback";
import { speechForText, verifySpeech } from "../src/server/tts/speech";
import type { AyahRecitationResult } from "../src/lib/types";

const WORDS = ["كلمةاولى", "كلمةثانية", "كلمةثالثة"];
const ayah = (n: number, status: AyahRecitationResult["status"], heardSome = true): AyahRecitationResult => ({
  key: `1:${n}`,
  ayah: n,
  accuracy: status === "mastered" ? 1 : 0.5,
  status,
  words: WORDS.map((text, i) =>
    status === "mastered" ? { text, state: "ok" } : status === "uncertain" ? (heardSome && i === 0 ? { text, state: "ok" } : { text, state: "uncertain" }) : { text, state: "incorrect" },
  ),
  mistakes: [],
});
const noQuranWords = (t: string) => WORDS.every((w) => !t.includes(w));

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["GEMINI_API_KEY", "OPENAI_API_KEY", "SESSION_SECRET", "ASSISTANT_TTS", "TTS_PROVIDER"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("all correct → praise; no ayah to repeat", () => {
  const a = { recognition: "good" as const, ayahs: [ayah(1, "mastered"), ayah(2, "mastered")] };
  assert.deepEqual(ayahsToRepeat(a), []);
  const t = recitationFeedbackText(a);
  assert.match(t, /أحسنت/);
  assert.ok(noQuranWords(t));
});

test("mistakes → names the ayah numbers, asks to listen to the reciter and retry, never says the words", () => {
  const a = { recognition: "good" as const, ayahs: [ayah(1, "mastered"), ayah(2, "needs-review"), ayah(3, "missed"), ayah(4, "mastered")] };
  assert.deepEqual(ayahsToRepeat(a), [2, 3]);
  const t = recitationFeedbackText(a);
  assert.match(t, /الآيتين ٢ و٣/);
  assert.match(t, /استمع إلى الشيخ/);
  assert.match(t, /أعد المحاولة/);
  assert.ok(noQuranWords(t));
});

test("only recognizer doubt → nothing counted, asks to repeat more clearly", () => {
  const a = { recognition: "good" as const, ayahs: [ayah(1, "mastered"), ayah(5, "uncertain")] };
  assert.deepEqual(ayahsToRepeat(a), []);
  assert.deepEqual(ayahsUnsure(a), [5]);
  assert.match(recitationFeedbackText(a), /الآية ٥/);
});

test("not heard → asks to come closer and recite again; no ayah blamed", () => {
  const a = { recognition: "poor" as const, ayahs: [ayah(1, "missed")] };
  assert.deepEqual(ayahsToRepeat(a), []);
  assert.match(recitationFeedbackText(a), /لم أسمع/);
});

test("speechForText signs the feedback only when a voice engine and secret exist", () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.TTS_PROVIDER;
  delete process.env.ASSISTANT_TTS;
  process.env.SESSION_SECRET = "s".repeat(48);
  const text = recitationFeedbackText({ recognition: "good", ayahs: [ayah(1, "mastered")] });
  assert.equal(speechForText(text), null);
  process.env.GEMINI_API_KEY = "gm-test";
  const p = speechForText(text);
  assert.ok(p);
  assert.equal(p!.text, text);
  assert.ok(verifySpeech(p!, process.env.SESSION_SECRET!));
  process.env.ASSISTANT_TTS = "off";
  assert.equal(speechForText(text), null);
});

test("stopped early: unheard trailing ayahs → 'complete the recitation', not 'unsure'", () => {
  const a = { recognition: "good" as const, ayahs: [ayah(1, "mastered"), ayah(2, "mastered"), ayah(3, "mastered"), ayah(4, "uncertain", false), ayah(5, "uncertain", false)] };
  assert.deepEqual(ayahsNotRecited(a), [4, 5]);
  assert.deepEqual(ayahsUnsure(a), []);
  const f = teacherFeedback(a);
  assert.equal(f.key, "incomplete");
  assert.match(f.text, /لم أسمع الآيتين ٤ و٥/);
  assert.match(f.text, /أكمل التسميع/);
});

test("spoken sentences are a small fixed set (prepared ahead), with no numbers and no Quran words", () => {
  for (const t of Object.values(TEACHER_PHRASES)) {
    assert.ok(!/[0-9٠-٩]/.test(t));
    assert.ok(noQuranWords(t));
  }
  const keys = new Set([
    teacherFeedback({ recognition: "poor", ayahs: [] }).key,
    teacherFeedback({ recognition: "good", ayahs: [ayah(1, "mastered")] }).key,
    teacherFeedback({ recognition: "good", ayahs: [ayah(1, "missed")] }).key,
    teacherFeedback({ recognition: "good", ayahs: [ayah(1, "uncertain")] }).key,
  ]);
  for (const k of keys) assert.ok(k in TEACHER_PHRASES);
  assert.equal(ayahNumbers([7]), "الآية ٧");
  assert.equal(ayahNumbers([1, 2, 3]), "الآيات ١ و٢ و٣");
});
