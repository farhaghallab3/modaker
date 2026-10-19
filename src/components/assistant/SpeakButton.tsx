"use client";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/components/ui/primitives";
import { useSpeech } from "@/lib/assistant/speech-player";
import type { AssistantAnswer } from "@/lib/types";

/**
 * «🔊 استمع للإجابة» — reads the assistant's generated explanation aloud (AI voice). Shown only when the server attached a signed speech
 * payload to the answer; Quran/hadith evidence is never part of it. A failure only shows a small note: the written answer is untouched.
 */
export function SpeakButton({ answer, id, className }: { answer: AssistantAnswer; id: string; className?: string }) {
  const speech = answer.speech;
  // hooks must run unconditionally: a dummy payload is never used when `speech` is absent
  const { status, toggle, stop } = useSpeech(id, speech ?? { text: "", exp: 0, sig: "" });
  if (!speech) return null;

  const busy = status === "loading";
  const label = status === "playing" ? "إيقاف مؤقت" : status === "paused" ? "متابعة الاستماع" : busy ? "جارٍ تجهيز الصوت…" : "استمع للإجابة";
  const icon = status === "playing" ? "pause" : status === "paused" ? "play" : "volume";

  return (
    <div className={cn("mt-2 flex flex-wrap items-center gap-2 text-sm", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-busy={busy}
        aria-label={label}
        className="inline-flex items-center gap-2 rounded-xl bg-parchment px-3 py-1.5 text-forest ring-1 ring-line transition-colors hover:bg-sage disabled:opacity-60"
      >
        {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-olive border-t-transparent" aria-hidden /> : <Icon name={icon} size={16} />}
        <span>{status === "idle" || status === "error" ? "🔊 " : ""}{label}</span>
      </button>
      {status === "playing" || status === "paused" ? (
        <button type="button" onClick={stop} aria-label="إنهاء الاستماع" className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-muted ring-1 ring-line hover:bg-parchment">
          <Icon name="stop" size={14} />
          <span>إنهاء</span>
        </button>
      ) : null}
      <span className="text-xs text-muted">صوت مولَّد بالذكاء الاصطناعي</span>
      {status === "error" ? (
        <span role="status" className="text-xs text-terracotta">
          تعذّر تشغيل الصوت الآن. الإجابة المكتوبة كما هي.
        </span>
      ) : null}
    </div>
  );
}
