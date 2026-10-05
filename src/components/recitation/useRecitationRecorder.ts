"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { alternativeRecognizer, getRecognizer, SpeechError, type RecognitionSession, type SpeechRecognizer } from "@/lib/recitation/speech";
import type { AyahRange, Transcript } from "@/lib/types";

export type RecorderPhase = "idle" | "starting" | "recording" | "transcribing" | "error";

/** Hard cap so a forgotten session never records indefinitely. */
const MAX_RECORDING_SEC = 15 * 60;

/**
 * Drives one RecognitionSession at a time for the recitation screen.
 * Guarantees the mic is released on stop, cancel, error and unmount.
 */
export function useRecitationRecorder({
  range,
  onTranscript,
}: {
  range: AyahRange | null;
  onTranscript: (t: Transcript) => void;
}) {
  const [recognizer, setRecognizer] = useState<SpeechRecognizer | null>(null);
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<SpeechError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState("");

  const session = useRef<RecognitionSession | null>(null);
  const unsubs = useRef<(() => void)[]>([]);
  const levelSubs = useRef(new Set<(l: number) => void>());
  const startedAt = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const stopRef = useRef<() => void>(() => {});

  // Recognizer detection is browser-only.
  useEffect(() => {
    setRecognizer(getRecognizer());
    setChecked(true);
  }, []);

  const detach = useCallback(() => {
    unsubs.current.forEach((u) => u());
    unsubs.current = [];
    levelSubs.current.forEach((cb) => cb(0));
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      detach();
      session.current = null;
      setError(e instanceof SpeechError ? e : new SpeechError("unknown", (e as Error)?.message, e));
      setPhase("error");
    },
    [detach],
  );

  const start = useCallback(async () => {
    if (!range || session.current) return;
    if (!recognizer) return fail(new SpeechError("unsupported"));
    if (typeof navigator !== "undefined" && navigator.onLine === false) return fail(new SpeechError("network"));
    setError(null);
    setInterim("");
    setElapsed(0);
    setPhase("starting");
    const s = recognizer.createSession({ language: "ar-SA", range });
    session.current = s;
    if (s.onLevel) unsubs.current.push(s.onLevel((l) => levelSubs.current.forEach((cb) => cb(l))));
    if (s.onInterim) unsubs.current.push(s.onInterim(setInterim));
    if (s.onError) unsubs.current.push(s.onError((e) => session.current === s && fail(e)));
    try {
      await s.start();
      if (session.current !== s) {
        s.cancel(); // cancelled while asking for permission — release the mic it just opened
        return;
      }
      startedAt.current = performance.now();
      setPhase("recording");
    } catch (e) {
      s.cancel();
      if (session.current === s) fail(e);
    }
  }, [range, recognizer, fail]);

  const stop = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    setPhase("transcribing");
    try {
      const t = await s.stop();
      if (session.current !== s) return;
      detach();
      session.current = null;
      if (!t.text.trim()) return fail(new SpeechError("no-speech"));
      setPhase("idle");
      onTranscriptRef.current(t);
    } catch (e) {
      if (session.current === s) fail(e);
    }
  }, [detach, fail]);
  stopRef.current = () => void stop();

  const cancel = useCallback(() => {
    const s = session.current;
    session.current = null;
    s?.cancel();
    detach();
    setInterim("");
    setElapsed(0);
    setPhase("idle");
  }, [detach]);

  const reset = useCallback(() => {
    cancel();
    setError(null);
  }, [cancel]);

  /** Switch to the other recognizer (e.g. server STT is down → on-device). */
  const switchRecognizer = useCallback(() => {
    if (!recognizer) return;
    const alt = alternativeRecognizer(recognizer);
    if (alt) {
      setRecognizer(alt);
      setError(null);
      setPhase("idle");
    }
  }, [recognizer]);

  // Elapsed timer + hard cap.
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const sec = (performance.now() - startedAt.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_RECORDING_SEC) stopRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  // Always release the microphone when the screen goes away.
  useEffect(
    () => () => {
      session.current?.cancel();
      session.current = null;
      unsubs.current.forEach((u) => u());
    },
    [],
  );

  const subscribeLevel = useCallback((cb: (l: number) => void) => {
    levelSubs.current.add(cb);
    return () => {
      levelSubs.current.delete(cb);
    };
  }, []);

  return {
    recognizer,
    /** false until browser capabilities were detected */
    checked,
    supported: !!recognizer,
    canSwitch: !!recognizer && !!alternativeRecognizer(recognizer),
    phase,
    error,
    elapsed,
    interim,
    start,
    stop,
    cancel,
    reset,
    switchRecognizer,
    subscribeLevel,
  };
}

export type RecitationRecorderController = ReturnType<typeof useRecitationRecorder>;
