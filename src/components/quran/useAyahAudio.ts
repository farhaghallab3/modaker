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
 * Playing the whole list flows without pauses: the next ayah is loaded in a second player while the current one
 * plays, and the two players take turns, and
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
    el.preload = "auto";
    audio.current = el;
    const next = new Audio();
    next.preload = "auto";
    preload.current = next;
    return () => {
      el.pause();
      next.pause();
      el.src = "";
      next.src = "";
    };
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      const a = ayahs[i];
      if (!audio.current || !a) {
        setError(true);
        return;
      }
      setError(false);
      setCurrent(i);
      const url = reciterAudioUrl(reciter, a.surah, a.ayah);
      const prev = audio.current;
      const ready = preload.current;
      let swapped = false;
      if (ready && ready !== prev && ready.dataset.url === url) {
        // The next ayah is already loaded in the second player: start it at once (no gap between ayahs).
        audio.current = ready;
        preload.current = prev;
        swapped = true;
        ready.currentTime = 0;
      } else if (prev.dataset.url === url) {
        prev.currentTime = 0; // the same ayah again (repeat)
      } else {
        prev.src = url;
        prev.dataset.url = url;
      }
      const el = audio.current;
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {
          if (swapped && audio.current === el) {
            // Some phones only let the first player start on its own: load the ayah there instead.
            audio.current = prev;
            preload.current = el;
            prev.src = url;
            prev.dataset.url = url;
            return prev.play().then(() => setPlaying(true));
          }
          throw new Error("play refused");
        })
        .catch(() => {
          setPlaying(false);
          setError(true);
        });
      // Continuous listening: load the next ayah in the second player now, so it starts the moment this one ends.
      const after = ayahs[i + 1];
      const other = preload.current;
      if (other && after && !counters.current.stopAfterOne) {
        const nextUrl = reciterAudioUrl(reciter, after.surah, after.ayah);
        if (other.dataset.url !== nextUrl) {
          other.src = nextUrl;
          other.dataset.url = nextUrl;
          other.load();
        }
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
    const els = [audio.current, preload.current].filter((x): x is HTMLAudioElement => !!x);
    if (!els.length) return;
    // Both players carry the listeners; only the one playing now counts.
    const onEnded = (ev: Event) => {
      if (ev.currentTarget !== audio.current) return;
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
    const onError = (ev: Event) => {
      if (ev.currentTarget !== audio.current) return;
      setPlaying(false);
      setError(true);
    };
    for (const el of els) {
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
      }
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
