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

export function stopTeacher() {
  if (current) {
    current.onended = null;
    current.pause();
    current = null;
  }
}

/** Plays a sentence now if its audio is ready; waits briefly for it otherwise. Resolves false when there is no voice. */
export async function playTeacher(key: TeacherPhraseKey, onEnd?: () => void): Promise<boolean> {
  stopTeacher();
  if (!urls.has(key)) {
    await Promise.race([prepareTeacherVoice(), new Promise((r) => setTimeout(r, 2500))]);
  }
  const url = urls.get(key);
  if (!url) return false;
  const a = new Audio(url);
  current = a;
  a.onended = () => {
    if (current === a) current = null;
    onEnd?.();
  };
  try {
    await a.play();
    return true;
  } catch {
    if (current === a) current = null;
    return false;
  }
}

export function teacherVoiceReady(key: TeacherPhraseKey): boolean {
  return urls.has(key);
}
