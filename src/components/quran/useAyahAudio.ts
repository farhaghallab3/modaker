"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reciterAudioUrl, useReciter } from "@/lib/quran/reciters";
import { ayahStart, hasSurahAudio, type SurahTiming } from "@/lib/quran/surah-audio";
import type { Ayah } from "@/lib/types";

/**
 * Sequential ayah audio with per-ayah and per-range repeat.
 * `repeatEach` repeats each ayah N times before moving on; `repeatRange` loops the whole range N times.
 * The voice is the learner's chosen reciter (src/lib/quran/reciters.ts); switching reciter while
 * an ayah plays restarts that ayah in the new voice.
 *
 * Two ways to play:
 * - Whole-surah file (most reciters, src/lib/quran/surah-audio.ts): one recording of the surah, as in a Quran app.
 *   Ayahs follow each other inside the recording, so listening is continuous with no cut between ayahs; the player
 *   only watches the time to know which ayah is heard, and to stop or repeat at an ayah's end.
 * - Ayah by ayah (other reciters, or when the surah file fails): one file per ayah; the next ayah is loaded in a
 *   second player while the current one plays, and the two players take turns.
 * `onListEnd` (when given) is called at the end so the screen can move on to the next surah or page.
 * Pausing then playing goes on from the same moment. Playing one ayah (playOne) plays only that ayah.
 */
const CONTINUOUS_KEY = "modaker:audio-continuous";

// Timings of whole-surah files, per reciter and surah (shared by every player, kept for the visit).
const timingLoads = new Map<string, Promise<SurahTiming | null>>();
const timings = new Map<string, SurahTiming | null>();
const timingKey = (reciterId: string, surah: number) => `${reciterId}:${surah}`;
function loadTiming(reciterId: string, surah: number): Promise<SurahTiming | null> {
  const k = timingKey(reciterId, surah);
  let p = timingLoads.get(k);
  if (!p) {
    p = fetch(`/api/v1/quran/audio-timing?reciter=${encodeURIComponent(reciterId)}&surah=${surah}`)
      .then((r) => (r.ok ? (r.json() as Promise<SurahTiming>) : null))
      .catch(() => null)
      .then((t) => {
        timings.set(k, t);
        if (!t) timingLoads.delete(k); // try again on a later visit
        return t;
      });
    timingLoads.set(k, p);
  }
  return p;
}
// Surah files that failed to play on this device: those surahs are played ayah by ayah.
const brokenFiles = new Set<string>();

interface Seg {
  url: string;
  start: number;
  end: number;
}
interface SegState extends Seg {
  i: number;
  /** stopped at the end of a single ayah: playing again replays it */
  done: boolean;
}

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
  const seg = useRef<SegState | null>(null); // set while playing from a whole-surah file
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

  // Fetch the surah timings as soon as the page opens, so the first ▶ already plays the whole-surah file.
  useEffect(() => {
    if (!hasSurahAudio(reciter.id)) return;
    for (const s of new Set(ayahs.map((a) => a.surah))) void loadTiming(reciter.id, s);
  }, [ayahs, reciter.id]);

  /** Where ayah i is in its whole-surah file, or null (no file, not loaded yet, or failed here). */
  const segOf = useCallback(
    (i: number): Seg | null => {
      const a = ayahs[i];
      if (!a || !hasSurahAudio(reciter.id)) return null;
      const t = timings.get(timingKey(reciter.id, a.surah));
      const at = t?.ayahs[a.ayah - 1];
      if (!t || !at || brokenFiles.has(t.url)) return null;
      return { url: t.url, start: ayahStart(t, a.ayah), end: at.end };
    },
    [ayahs, reciter.id],
  );

  const playIndex = useCallback(
    (i: number) => {
      const a = ayahs[i];
      if (!audio.current || !a) {
        setError(true);
        return;
      }
      setError(false);
      setCurrent(i);

      // ── Whole-surah file: seek to the ayah and play on.
      const s = segOf(i);
      if (s) {
        const el = audio.current;
        preload.current?.pause();
        seg.current = { ...s, i, done: false };
        if (el.dataset.url !== s.url) {
          el.src = s.url;
          el.dataset.url = s.url;
        }
        if (el.readyState >= 1) el.currentTime = s.start;
        else {
          el.currentTime = s.start;
          el.addEventListener(
            "loadedmetadata",
            () => {
              if (seg.current?.url === s.url && seg.current.i === i && el.currentTime < s.start - 0.5) el.currentTime = s.start;
            },
            { once: true },
          );
        }
        el.play()
          .then(() => setPlaying(true))
          .catch((e: unknown) => {
            if ((e as { name?: string })?.name === "AbortError") return; // a newer play() took over
            setPlaying(false);
            setError(true);
          });
        return;
      }

      // ── Ayah by ayah.
      seg.current = null;
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
      if (other && after && !counters.current.stopAfterOne && !segOf(i + 1)) {
        const nextUrl = reciterAudioUrl(reciter, after.surah, after.ayah);
        if (other.dataset.url !== nextUrl) {
          other.src = nextUrl;
          other.dataset.url = nextUrl;
          other.load();
        }
      }
    },
    [ayahs, reciter, segOf],
  );

  // A new reciter while an ayah is playing: continue from the same ayah in the new voice.
  const lastReciter = useRef(reciter.id);
  useEffect(() => {
    if (lastReciter.current === reciter.id) return;
    lastReciter.current = reciter.id;
    if (playing && current != null) playIndex(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciter.id]);

  /** The end of the ayah being heard (or of the whole list): repeat, stop, or go on. */
  const finishAyah = (i: number): "stay" | "next" | "moved" => {
    const c = counters.current;
    c.each += 1;
    if (c.each < repeatEach) {
      playIndex(i);
      return "moved";
    }
    c.each = 0;
    if (c.stopAfterOne) return "stay";
    if (i + 1 < ayahs.length) return "next";
    c.range += 1;
    if (c.range < repeatRange) {
      playIndex(0);
      return "moved";
    }
    c.range = 0;
    return "stay";
  };

  const endOfList = () => {
    seg.current = null;
    setPlaying(false);
    setCurrent(null);
    const last = ayahs[ayahs.length - 1];
    if (last) onListEnd.current?.(last.key);
  };

  // Whole-surah file: follow the time and act at each ayah's end. `atFileEnd`: the recording itself ended.
  const tick = (atFileEnd = false) => {
    const el = audio.current;
    let s = seg.current;
    if (!el || !s || s.done) return;
    const t = atFileEnd ? Infinity : el.currentTime;
    while (s && t >= s.end - 0.03) {
      const step = finishAyah(s.i);
      if (step === "moved") return;
      if (step === "stay") {
        el.pause();
        setPlaying(false);
        if (counters.current.stopAfterOne) s.done = true;
        else endOfList();
        return;
      }
      const n: number = s.i + 1;
      const ns: Seg | null = segOf(n);
      if (!ns || ns.url !== s.url || Math.abs(ns.start - s.end) > 0.6) {
        playIndex(n); // another file (next surah on the page), ayah by ayah, or a jump in the timings
        return;
      }
      // The next ayah follows in the same recording: nothing to load, it is already playing.
      s = { ...ns, i: n, done: false };
      seg.current = s;
      setCurrent(n);
    }
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!playing || !seg.current) return;
    const id = window.setInterval(() => tickRef.current(), 50);
    return () => window.clearInterval(id);
  }, [playing, current]);

  useEffect(() => {
    const els = [audio.current, preload.current].filter((x): x is HTMLAudioElement => !!x);
    if (!els.length) return;
    // Both players carry the listeners; only the one playing now counts.
    const onEnded = (ev: Event) => {
      if (ev.currentTarget !== audio.current) return;
      if (seg.current) return tickRef.current(true);
      if (current == null) return;
      const step = finishAyah(current);
      if (step === "moved") return;
      if (step === "next") return playIndex(current + 1);
      if (counters.current.stopAfterOne) return setPlaying(false);
      endOfList();
    };
    const onTime = (ev: Event) => {
      if (ev.currentTarget === audio.current && seg.current) tickRef.current();
    };
    const onError = (ev: Event) => {
      if (ev.currentTarget !== audio.current) return;
      const s = seg.current;
      if (s) {
        // The surah file did not load here: play this surah ayah by ayah instead.
        brokenFiles.add(s.url);
        seg.current = null;
        return playIndex(s.i);
      }
      setPlaying(false);
      setError(true);
    };
    for (const el of els) {
      el.addEventListener("ended", onEnded);
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("error", onError);
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("error", onError);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, ayahs, repeatEach, repeatRange, playIndex]);

  const resume = () => {
    const s = seg.current;
    if (s?.done) {
      counters.current.each = 0;
      return playIndex(s.i); // stopped at the end of one ayah: hear it again
    }
    audio.current?.play().then(() => setPlaying(true)).catch(() => setError(true));
  };

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
    /** ▶ on an ayah: plays on from it (continuous listening), or only that ayah when continuous is off.
     *  ▶ on the ayah that was paused goes on from where it stopped. */
    playFrom(i: number) {
      if (i === current && !playing && !error && !seg.current?.done && audio.current?.currentTime) return resume();
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
    /** go on from the moment it was paused */
    resume,
    stop() {
      const el = audio.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      seg.current = null;
      setPlaying(false);
      setCurrent(null);
    },
  };
}
