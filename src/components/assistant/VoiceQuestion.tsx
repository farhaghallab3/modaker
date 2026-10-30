"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { looksLikeNoSpeech } from "@/lib/assistant/voice";
import type { AyahRange } from "@/lib/types";

export type VoiceState = "idle" | "recording" | "transcribing";

/**
 * Voice question, sent like a voice note: the recording is shown in the chat as audio (kept in memory only, never
 * uploaded except for speech-to-text), and the recognized text is sent to the assistant with it and shown small
 * under the note, so a misheard question is visible.
 */
export function useVoiceQuestion({
  range,
  onText,
}: {
  range: AyahRange;
  onText: (text: string, note: { blob: Blob; seconds: number }) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const r = new MediaRecorder(s);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        release();
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        chunks.current = [];
        if (blob.size < 1500) {
          setState("idle");
          setError("لم نسمع صوتك. اقترب من الميكروفون وأعد المحاولة.");
          return;
        }
        setState("transcribing");
        try {
          const t = await api.transcribe(blob, range);
          const text = (t.text ?? "").trim();
          if (looksLikeNoSpeech(t)) setError("لم نسمع سؤالك بوضوح. اقترب من الميكروفون وأعد المحاولة، أو اكتب سؤالك.");
          else onText(text, { blob, seconds });
        } catch {
          setError("تعذّر تحويل الصوت إلى نص الآن. يمكنك كتابة سؤالك.");
        } finally {
          setState("idle");
        }
      };
      rec.current = r;
      startedAt.current = Date.now();
      r.start();
      setState("recording");
    } catch {
      release();
      setState("idle");
      setError("لم يُسمح باستخدام الميكروفون. يمكنك كتابة سؤالك.");
    }
  }, [onText, range, release]);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }, []);

  return { supported, state, error, start, stop, clearError: () => setError(null) };
}

export function VoiceButton({ state, onStart, onStop, disabled }: { state: VoiceState; onStart: () => void; onStop: () => void; disabled?: boolean }) {
  const recording = state === "recording";
  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled || state === "transcribing"}
      aria-pressed={recording}
      aria-label={recording ? "إيقاف التسجيل" : "اسأل بصوتك"}
      className={cn(
        "grid place-items-center size-10 shrink-0 rounded-xl transition-colors disabled:opacity-50",
        recording ? "bg-terracotta text-cream animate-pulse" : "bg-parchment text-forest hover:bg-sage",
      )}
    >
      <Icon name={recording ? "stop" : "mic"} size={18} />
    </button>
  );
}
