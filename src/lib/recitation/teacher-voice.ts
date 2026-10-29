"use client";

/**
 * Plays the teacher's fixed feedback sentences INSTANTLY.
 *  1. Normally they are static files recorded at build time (public/teacher-voice, scripts/teacher-voice.ts): loaded as
 *     soon as the recite page opens, served from the CDN, no voice-service call.
 *  2. Fallback (no recorded files): fetched once from the voice service while the learner recites, kept in Cache Storage.
 * Output only; nothing the learner says is stored.
 */
import { api } from "@/lib/api";
import { TEACHER_PHRASES, teacherPhraseHash, type TeacherPhraseKey } from "./coach-feedback";

const CACHE = "modaker-teacher-voice-v1";
const urls = new Map<string, string>(); // phrase key → object URL
let preparing: Promise<void> | null = null;
let current: HTMLAudioElement | null = null;

function cacheKey(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `/__teacher-voice/${h.toString(36)}`;
}

async function fromCache(text: string): Promise<Blob | null> {
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(cacheKey(text));
    return r ? await r.blob() : null;
  } catch {
    return null;
  }
}

async function toCache(text: string, blob: Blob) {
  try {
    const c = await caches.open(CACHE);
    await c.put(cacheKey(text), new Response(blob, { headers: { "content-type": blob.type || "audio/wav" } }));
  } catch {
    /* private mode or no Cache Storage: memory only */
  }
}

/** Static files recorded at build time. True when every sentence is ready this way. */
async function loadRecorded(): Promise<boolean> {
  try {
    const res = await fetch("/teacher-voice/manifest.json");
    if (!res.ok) return false;
    const manifest = (await res.json()) as Record<string, { file: string; hash: string }>;
    const entries = Object.entries(TEACHER_PHRASES) as [TeacherPhraseKey, string][];
    if (!entries.every(([k, t]) => manifest[k]?.hash === teacherPhraseHash(t))) return false; // sentences changed since the build
    await Promise.all(
      entries.map(async ([k]) => {
        if (urls.has(k)) return;
        const r = await fetch(`/teacher-voice/${manifest[k].file}`);
        if (!r.ok) throw new Error("missing file");
        urls.set(k, URL.createObjectURL(await r.blob()));
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Gets the audio of every teacher sentence ready (recorded files first). Safe to call many times. */
export function prepareTeacherVoice(): Promise<void> {
  if (preparing) return preparing;
  preparing = (async () => {
    if (await loadRecorded()) return;
    const { phrases } = await api.teacherVoice();
    if (!phrases) return;
    // one after another: keeps well under the voice service's rate limits
    for (const [key, payload] of Object.entries(phrases)) {
      if (urls.has(key)) continue;
      let blob = await fromCache(payload.text);
      if (!blob) {
        blob = await api.speech(payload);
        void toCache(payload.text, blob);
      }
      urls.set(key, URL.createObjectURL(blob));
    }
  })().catch(() => {
    preparing = null; // try again next time
  });
  return preparing;
}

let settle: ((ok: boolean) => void) | null = null;
let generation = 0;

/** Changes every time the teacher is stopped: a running sequence of clips checks it to know it was interrupted. */
export function teacherGeneration(): number {
  return generation;
}

/** Stops whatever the teacher (or a reciter's word clip) is saying, and any sequence in progress. */
export function stopTeacher() {
  generation++;
  haltAudio();
}

function haltAudio() {
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    current = null;
  }
  const s = settle;
  settle = null;
  s?.(false);
}

/** Plays one clip (a teacher sentence or a reciter's word) to its end. True when it played to the end. */
export function playClip(src: string): Promise<boolean> {
  haltAudio();
  return new Promise((resolve) => {
    const a = new Audio(src);
    current = a;
    const done = (ok: boolean) => {
      if (current === a) current = null;
      if (settle === done) settle = null;
      resolve(ok);
    };
    settle = done;
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.play().catch(() => done(false));
  });
}

/** Says a fixed sentence to its end (waits briefly for its audio). False when there is no voice or it was stopped. */
export async function sayPhrase(key: TeacherPhraseKey): Promise<boolean> {
  const g = generation;
  if (!urls.has(key)) await Promise.race([prepareTeacherVoice(), new Promise((r) => setTimeout(r, 2500))]);
  const url = urls.get(key);
  return url && g === generation ? playClip(url) : false;
}

const spoken = new Map<string, Promise<string | null>>(); // signed text → object URL

/** Fetches a sentence the server wrote and signed (e.g. a tajweed note) as audio. Null when the voice is unavailable. */
export function loadSpokenText(payload: { text: string; exp: number; sig: string }): Promise<string | null> {
  let p = spoken.get(payload.text);
  if (!p) {
    p = (async () => {
      let blob = await fromCache(payload.text);
      if (!blob) {
        blob = await api.speech(payload);
        void toCache(payload.text, blob);
      }
      return URL.createObjectURL(blob);
    })().catch(() => {
      spoken.delete(payload.text);
      return null;
    });
    spoken.set(payload.text, p);
  }
  return p;
}

export function teacherVoiceReady(key: TeacherPhraseKey): boolean {
  return urls.has(key);
}
