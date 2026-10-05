"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ayah } from "@/lib/types";

/**
 * Sequential ayah audio with per-ayah and per-range repeat.
 * One <audio> element; ayahs play in order; `repeatEach` repeats each ayah
 * N times before moving on; `repeatRange` loops the whole range N times.
 */
export function useAyahAudio(ayahs: Ayah[]) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<number | null>(null); // index in ayahs
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [repeatEach, setRepeatEach] = useState(1);
  const [repeatRange, setRepeatRange] = useState(1);
  const counters = useRef({ each: 0, range: 0, stopAfterOne: false });

  useEffect(() => {
    const el = new Audio();
    el.preload = "none";
    audio.current = el;
    return () => {
      el.pause();
      el.src = "";
    };
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      const el = audio.current;
      const a = ayahs[i];
      if (!el || !a?.audioUrl) {
        setError(true);
        return;
      }
      setError(false);
      setCurrent(i);
      el.src = a.audioUrl;
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {
          setPlaying(false);
          setError(true);
        });
    },
    [ayahs],
  );

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
  }, [current, ayahs.length, repeatEach, repeatRange, playIndex]);

  return {
    current,
    playing,
    error,
    repeatEach,
    repeatRange,
    setRepeatEach,
    setRepeatRange,
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
