"use client";

/**
 * One shared audio player for spoken assistant answers: playing another answer stops the previous one; audio lives only in memory
 * (object URLs, revoked on stop) and is never stored. Output only — unrelated to recitation recording / STT.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";

export type SpeechStatus = "idle" | "loading" | "playing" | "paused" | "error";
interface State {
  id: string | null;
  status: SpeechStatus;
}

let state: State = { id: null, status: "idle" };
let audio: HTMLAudioElement | null = null;
let url: string | null = null;
let run = 0; // invalidates in-flight loads when the user switches or stops
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function release() {
  if (audio) {
    audio.onended = audio.onerror = audio.onpause = audio.onplay = null;
    audio.pause();
    audio = null;
  }
  if (url) {
    URL.revokeObjectURL(url);
    url = null;
  }
}

export function stopSpeech() {
  run++;
  release();
  set({ id: null, status: "idle" });
}

async function start(id: string, speech: { text: string; exp: number; sig: string }) {
  stopSpeech();
  const mine = ++run;
  set({ id, status: "loading" });
  try {
    const blob = await api.speech(speech);
    if (mine !== run) return; // switched to another answer / stopped meanwhile
    url = URL.createObjectURL(blob);
    const a = new Audio(url);
    audio = a;
    a.onended = () => mine === run && stopSpeech();
    a.onerror = () => {
      if (mine !== run) return;
      release();
      set({ id, status: "error" });
    };
    a.onpause = () => mine === run && !a.ended && set({ id, status: "paused" });
    a.onplay = () => mine === run && set({ id, status: "playing" });
    await a.play();
  } catch {
    if (mine !== run) return;
    release();
    set({ id, status: "error" });
  }
}

export function useSpeech(id: string, speech: { text: string; exp: number; sig: string }) {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
  const status: SpeechStatus = snap.id === id ? snap.status : "idle";
  // leaving the screen stops this answer's audio
  useEffect(() => () => void (state.id === id && stopSpeech()), [id]);
  const toggle = useCallback(() => {
    if (state.id === id && state.status === "playing") audio?.pause();
    else if (state.id === id && state.status === "paused") void audio?.play();
    else if (state.id === id && state.status === "loading") stopSpeech();
    else void start(id, speech);
  }, [id, speech]);
  return { status, toggle, stop: stopSpeech };
}
