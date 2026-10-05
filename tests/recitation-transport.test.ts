/**
 * Recording → transcription transport. Runs the real serverUploadRecognizer against a fake
 * MediaRecorder / getUserMedia / fetch, so the conditions that used to end in the misleading
 * «لم نسمع تلاوة واضحة» (with no request ever sent) are pinned down.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/lib/api";
import { AUDIBLE_LEVEL, classifyEmptyTranscript } from "../src/lib/recitation/speech/empty-result";
import { pickMimeType, serverUploadRecognizer, speechErrorFromApi } from "../src/lib/recitation/speech/server-upload";
import { SpeechError } from "../src/lib/recitation/speech/types";

// ── fakes ────────────────────────────────────────────────────────────────

let chunkSizes: number[] = [];
let fetchCalls: { url: string; form: FormData | null }[] = [];
let fetchReply: () => Response = () => Response.json({ text: "نص", provider: "test", language: "ar" });

class FakeRecorder {
  static isTypeSupported = (t: string) => t.startsWith("audio/webm");
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public stream: unknown) {}
  start() {
    this.state = "recording";
    queueMicrotask(() => this.onstart?.());
  }
  stop() {
    // Per the spec: the FINAL dataavailable fires before `stop`.
    for (const size of chunkSizes) this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) });
    this.state = "inactive";
    queueMicrotask(() => this.onstop?.());
  }
}

const fakeStream = { getTracks: () => [{ stop() {} }], getAudioTracks: () => [{ readyState: "live", muted: false, enabled: true, stop() {} }] };
const g = globalThis as Record<string, unknown>;
const saved: Record<string, PropertyDescriptor | undefined> = {};

function stub(name: string, value: unknown) {
  saved[name] ??= Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

beforeEach(() => {
  chunkSizes = [4000, 6000, 3000];
  fetchCalls = [];
  fetchReply = () => Response.json({ text: "نص", provider: "test", language: "ar" });
  stub("MediaRecorder", FakeRecorder);
  stub("navigator", { mediaDevices: { getUserMedia: async () => fakeStream }, onLine: true });
  stub("fetch", async (url: string, init?: { body?: FormData }) => {
    fetchCalls.push({ url: String(url), form: init?.body instanceof FormData ? init.body : null });
    return fetchReply();
  });
});

afterEach(() => {
  for (const [name, d] of Object.entries(saved)) {
    if (d) Object.defineProperty(globalThis, name, d);
    else delete g[name];
  }
});

const range = { surah: 67, from: 1, to: 5 };
const open = async () => {
  const s = serverUploadRecognizer.createSession({ language: "ar-SA", range });
  await s.start();
  return s;
};

// ── the pipeline ─────────────────────────────────────────────────────────

test("a normal recording is finalised (last chunk included) and POSTed to /recitation/transcribe", async () => {
  const s = await open();
  const t = await s.stop();
  assert.equal(fetchCalls.length, 1, "exactly one request");
  assert.match(fetchCalls[0].url, /\/api\/v1\/recitation\/transcribe$/);
  const audio = fetchCalls[0].form?.get("audio") as Blob;
  assert.equal(audio.size, 13000, "every chunk, including the final one, is in the uploaded Blob");
  assert.equal(audio.type, "audio/webm");
  assert.deepEqual(JSON.parse(String(fetchCalls[0].form?.get("range"))), range);
  assert.equal(t.text, "نص");
});

test("a recording that produced no data is an explicit 'no-audio' error and sends NOTHING", async () => {
  chunkSizes = [];
  const s = await open();
  await assert.rejects(s.stop(), (e: unknown) => e instanceof SpeechError && e.code === "no-audio");
  assert.equal(fetchCalls.length, 0);
});

test("a header-only recording (a few hundred bytes) cannot contain speech: 'no-audio', no request", async () => {
  chunkSizes = [300];
  const s = await open();
  await assert.rejects(s.stop(), (e: unknown) => e instanceof SpeechError && e.code === "no-audio");
  assert.equal(fetchCalls.length, 0);
});

test("zero-byte chunks are ignored rather than counted", async () => {
  chunkSizes = [0, 5000, 0];
  const s = await open();
  await s.stop();
  assert.equal((fetchCalls[0].form?.get("audio") as Blob).size, 5000);
});

test("a server refusal of an empty upload is reported as 'no-audio', not as silence", () => {
  const e = speechErrorFromApi(new ApiError("التسجيل فارغ.", 400, "invalid_request"));
  assert.equal(e.code, "no-audio");
});

test("API errors keep their specific meaning", () => {
  assert.equal(speechErrorFromApi(new ApiError("x", 503, "stt_unavailable")).code, "stt-unavailable");
  assert.equal(speechErrorFromApi(new ApiError("x", 415, "unsupported_media_type")).code, "unsupported-format");
  assert.equal(speechErrorFromApi(new ApiError("x", 413, "payload_too_large")).code, "too-long");
  assert.equal(speechErrorFromApi(new ApiError("x", 429, "rate_limited")).code, "rate-limited");
  assert.equal(speechErrorFromApi(new TypeError("Failed to fetch")).code, "network");
});

test("a failed POST surfaces as its own error (never as 'no-speech')", async () => {
  fetchReply = () => Response.json({ error: "down", code: "stt_unavailable" }, { status: 503 });
  const s = await open();
  await assert.rejects(s.stop(), (e: unknown) => e instanceof SpeechError && e.code === "stt-unavailable");
  assert.equal(fetchCalls.length, 1);
});

test("an empty server transcript with a quiet microphone stays an empty transcript (genuine silence)", async () => {
  fetchReply = () => Response.json({ text: "", provider: "test", language: "ar" });
  const s = await open(); // no AudioContext in this environment → peak level 0 → quiet
  const t = await s.stop();
  assert.equal(t.text, "");
});

// ── silence vs recognition failure ───────────────────────────────────────

test("an empty transcript is 'silence' only when the microphone was quiet", () => {
  assert.equal(classifyEmptyTranscript(0.05, "x"), null);
  assert.equal(classifyEmptyTranscript(AUDIBLE_LEVEL - 0.01, "x"), null);
  const loud = classifyEmptyTranscript(0.83, "browser engine returned nothing");
  assert.ok(loud instanceof SpeechError && loud.code === "engine-no-result");
});

test("MIME selection prefers webm/opus when supported and never throws", () => {
  assert.equal(pickMimeType(), "audio/webm;codecs=opus");
  stub("MediaRecorder", undefined);
  assert.equal(pickMimeType(), "");
});
