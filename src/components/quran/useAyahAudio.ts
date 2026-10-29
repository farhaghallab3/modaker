"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reciterAudioUrl, useReciter } from "@/lib/quran/reciters";
import type { Ayah } from "@/lib/types";

/**
 * Sequential ayah audio with per-ayah and per-range repeat.
 * One <audio> element; ayahs play in order; `repeatEach` repeats each ayah
 * N times before moving on; `repeatRange` loops the whole range N times.
 * The voice is the learner's chosen reciter (src/lib/quran/reciters.ts); switching reciter while
 * an ayah plays restarts that ayah in the new voice.
 * Playing the whole list flows without pauses: the next ayah is fetched while the current one plays, and
 * `onListEnd` (when given) is called at the end so the screen can move on to the next surah or page.
 * Playing one ayah (playOne) plays only that ayah.
 */
const CONTINUOUS_KEY = "modaker:audio-continuous";

export function useAyahAudio(ayahs: Ayah[], opts: { onListEnd?: (lastKey: string) => void } = {}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const preload = useRef<HTMLAudioElement | null>(null);
  const onListEnd = useRef(opts.onListEnd);
  onListEnd.current = opts.onListEnd;
  const [current, setCurrent] = useState<number | null>(null); // index in ayahs
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [repeatEach, setRepeatEach] = useState(1);
  const [repeatRange, setRepeatRange] = useState(1);
  const counters = useRef({ each: 0, range: 0, stopAfterOne: false });
  const reciter = useReciter();
  // Continuous (default): ▶ on an ayah plays on from it. Off: ▶ on an ayah plays only that ayah. Remembered on this device.
  const [continuous, setContinuousState] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CONTINUOUS_KEY) === "off") setContinuousState(false);
    } catch {
      /* default */
    }
  }, []);
  const setContinuous = useCallback((on: boolean) => {
    setContinuousState(on);
    try {
      window.localStorage.setItem(CONTINUOUS_KEY, on ? "on" : "off");
    } catch {
      /* not remembered */
    }
  }, []);

  useEffect(() => {
    const el = new Audio();
    el.preload = "none";
    audio.current = el;
    const next = new Audio();
    next.preload = "auto";
    preload.current = next;
    return () => {
      el.pause();
      el.src = "";
      next.src = "";
    };
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      const el = audio.current;
      const a = ayahs[i];
      if (!el || !a) {
        setError(true);
        return;
      }
      setError(false);
      setCurrent(i);
      el.src = reciterAudioUrl(reciter, a.surah, a.ayah);
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {
          setPlaying(false);
          setError(true);
        });
      // Continuous listening: fetch the next ayah now, so it starts the moment this one ends.
      const after = ayahs[i + 1];
      if (preload.current && after && !counters.current.stopAfterOne) {
        preload.current.src = reciterAudioUrl(reciter, after.surah, after.ayah);
        preload.current.load();
      }
    },
    [ayahs, reciter],
  );

  // A new reciter while an ayah is playing: continue from the same ayah in the new voice.
  const lastReciter = useRef(reciter.id);
  useEffect(() => {
    if (lastReciter.current === reciter.id) return;
    lastReciter.current = reciter.id;
    if (playing && current != null) playIndex(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciter.id]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onEnded = () => {
      const c = counters.current;
      if (current == null) return;
      c.each += 1;
      if (c.each < repeatEach) return playIndex(current);
      c.each = 0;
      if (c.stopAfterOne) {
        setPlaying(false);
        return;
      }
      if (current + 1 < ayahs.length) return playIndex(current + 1);
      c.range += 1;
      if (c.range < repeatRange) return playIndex(0);
      c.range = 0;
      setPlaying(false);
      setCurrent(null);
      const last = ayahs[ayahs.length - 1];
      if (last) onListEnd.current?.(last.key);
    };
    const onError = () => {
      setPlaying(false);
      setError(true);
    };
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    };
  }, [current, ayahs, repeatEach, repeatRange, playIndex]);

  return {
    current,
    playing,
    error,
    repeatEach,
    repeatRange,
    setRepeatEach,
    setRepeatRange,
    continuous,
    setContinuous,
    /** ▶ on an ayah: plays on from it (continuous listening), or only that ayah when continuous is off */
    playFrom(i: number) {
      counters.current = { each: 0, range: 0, stopAfterOne: !continuous };
      playIndex(i);
    },
    /** play a single ayah (with repeatEach), then stop */
    playOne(i: number) {
      counters.current = { each: 0, range: 0, stopAfterOne: true };
      playIndex(i);
    },
    /** play the whole list from index (default 0) */
    playAll(from = 0) {
      counters.current = { each: 0, range: 0, stopAfterOne: false };
      playIndex(from);
    },
    pause() {
      audio.current?.pause();
      setPlaying(false);
    },
    resume() {
      audio.current?.play().then(() => setPlaying(true)).catch(() => setError(true));
    },
    stop() {
      const el = audio.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      setPlaying(false);
      setCurrent(null);
    },
  };
}
