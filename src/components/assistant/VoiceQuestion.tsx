"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { looksLikeNoSpeech } from "@/lib/assistant/voice";
import type { AyahRange } from "@/lib/types";

export type VoiceState = "idle" | "recording" | "transcribing";

/**
 * Voice question. Reuses the existing speech-to-text upload; the recognized text is NEVER sent to the assistant
 * automatically — it is placed in the question box for the learner to read, correct and send. The audio is held
 * in memory only for the request and dropped.
 */
export function useVoiceQuestion({ range, onText }: { range: AyahRange; onText: (text: string) => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

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
          else onText(text);
        } catch {
          setError("تعذّر تحويل الصوت إلى نص الآن. يمكنك كتابة سؤالك.");
        } finally {
          setState("idle");
        }
      };
      rec.current = r;
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
