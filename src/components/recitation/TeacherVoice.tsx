"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { stopSpeech, useSpeech } from "@/lib/assistant/speech-player";
import { toArabicDigits } from "@/lib/quran/surahs";
import { ayahsToRepeat, recitationFeedbackText } from "@/lib/recitation/coach-feedback";
import type { RecitationAnalysis } from "@/lib/types";

/**
 * «المعلّم»: after a recitation, the teacher tells the learner the result out loud (AI voice, fixed sentences with
 * ayah numbers only), then offers the REAL reciter for each ayah to fix and a retry. The Quran itself is only ever
 * heard in a human reciter's voice.
 */
export function TeacherVoice({
  analysis,
  canListen,
  onListenAyah,
  onRetry,
}: {
  analysis: RecitationAnalysis;
  /** whether the reciter's audio for this ayah is available on this screen */
  canListen: (ayah: number) => boolean;
  onListenAyah: (ayah: number) => void;
  onRetry: () => void;
}) {
  const id = useId();
  const text = analysis.feedbackText ?? recitationFeedbackText(analysis);
  const speech = analysis.speech;
  const { status, toggle } = useSpeech(id, speech ?? { text: "", exp: 0, sig: "" });
  const spoke = useRef(false);

  // Speak once as soon as the result arrives (the learner just pressed "finish", so the browser allows audio).
  useEffect(() => {
    if (speech && !spoke.current) {
      spoke.current = true;
      toggle();
    }
  }, [speech, toggle]);

  const repeat = ayahsToRepeat(analysis).filter(canListen).slice(0, 3);
  const playing = status === "playing";
  const busy = status === "loading";

  return (
    <section aria-label="ملاحظة المعلّم" className="mb-6 rounded-[var(--radius-card)] bg-olive-100/60 px-5 py-4 ring-1 ring-line animate-rise">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-forest text-white" aria-hidden>
          <Icon name="volume" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-olive">المعلّم</p>
          <p role="status" className="mt-1 text-[1rem] leading-8 text-ink">
            {text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {speech ? (
              <Button size="sm" variant="quiet" icon={playing ? "pause" : "volume"} aria-busy={busy} onClick={toggle}>
                {busy ? "جارٍ تجهيز الصوت…" : playing ? "إيقاف مؤقت" : "أعد سماع المعلّم"}
              </Button>
            ) : null}
            {repeat.map((n) => (
              <Button
                key={n}
                size="sm"
                variant="secondary"
                icon="play"
                onClick={() => {
                  stopSpeech();
                  onListenAyah(n);
                }}
              >
                استمع للشيخ: الآية {toArabicDigits(n)}
              </Button>
            ))}
            {repeat.length || analysis.recognition !== "good" ? (
              <Button
                size="sm"
                icon="mic"
                onClick={() => {
                  stopSpeech();
                  onRetry();
                }}
              >
                أعد المحاولة
              </Button>
            ) : null}
          </div>
          {speech ? <p className="mt-2 text-xs text-muted">صوت المعلّم مولَّد بالذكاء الاصطناعي؛ القرآن يُسمع بصوت القارئ فقط.</p> : null}
        </div>
      </div>
    </section>
  );
}
