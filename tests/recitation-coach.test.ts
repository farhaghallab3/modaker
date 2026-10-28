/**
 * The teacher's spoken feedback after a recitation: fixed sentences with ayah numbers only, never Quran words.
 * Synthetic words only — no Quran text.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ayahsToRepeat, ayahsUnsure, recitationFeedbackText } from "../src/lib/recitation/coach-feedback";
import { speechForText, verifySpeech } from "../src/server/tts/speech";
import type { AyahRecitationResult } from "../src/lib/types";

const WORDS = ["كلمةاولى", "كلمةثانية", "كلمةثالثة"];
const ayah = (n: number, status: AyahRecitationResult["status"]): AyahRecitationResult => ({
  key: `1:${n}`,
  ayah: n,
  accuracy: status === "mastered" ? 1 : 0.5,
  status,
  words: WORDS.map((text) => ({ text, state: status === "mastered" ? "ok" : "incorrect" })),
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
  assert.match(t, /الآيات ٢ و٣/);
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
