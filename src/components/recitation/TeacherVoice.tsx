"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import { ayahsToRepeat, teacherFeedback } from "@/lib/recitation/coach-feedback";
import { playTeacher, stopTeacher } from "@/lib/recitation/teacher-voice";
import type { RecitationAnalysis } from "@/lib/types";

/**
 * «المعلّم»: the moment a recitation is checked, the teacher says the result out loud (a short fixed sentence, prepared
 * while the learner was reciting) and shows it with the ayah numbers. Then: the REAL reciter for each ayah to fix, and
 * a retry. The Quran itself is only ever heard in a human reciter's voice.
 */
export function TeacherVoice({
  analysis,
  canListen,
  onListenAyah,
  onRetry,
}: {
  analysis: RecitationAnalysis;
  canListen: (ayah: number) => boolean;
  onListenAyah: (ayah: number) => void;
  onRetry: () => void;
}) {
  const { key, text } = useMemo(() => teacherFeedback(analysis), [analysis]);
  const [voice, setVoice] = useState<"idle" | "playing" | "none">("idle");
  const spoke = useRef(false);

  const speak = () => {
    setVoice("playing");
    void playTeacher(key, () => setVoice("idle")).then((ok) => !ok && setVoice("none"));
  };

  useEffect(() => {
    if (!spoke.current) {
      spoke.current = true;
      speak();
    }
    return () => stopTeacher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repeat = ayahsToRepeat(analysis).filter(canListen).slice(0, 3);
  const showRetry = key !== "perfect";

  return (
    <section aria-label="ملاحظة المعلّم" className="mb-6 rounded-[var(--radius-card)] bg-olive-100/60 px-5 py-4 ring-1 ring-line animate-rise">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-forest text-white" aria-hidden>
          <Icon name="volume" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-olive">المعلّم</p>
          <p role="status" className="mt-1 text-[1.05rem] leading-8 text-ink">
            {text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {repeat.map((n) => (
              <Button
                key={n}
                size="sm"
                variant="secondary"
                icon="play"
                onClick={() => {
                  stopTeacher();
                  setVoice("idle");
                  onListenAyah(n);
                }}
              >
                استمع للشيخ: الآية {toArabicDigits(n)}
              </Button>
            ))}
            {showRetry ? (
              <Button
                size="sm"
                icon="mic"
                onClick={() => {
                  stopTeacher();
                  onRetry();
                }}
              >
                أعد المحاولة
              </Button>
            ) : null}
            {voice !== "none" ? (
              <Button
                size="sm"
                variant="quiet"
                icon={voice === "playing" ? "stop" : "volume"}
                onClick={() => {
                  if (voice === "playing") {
                    stopTeacher();
                    setVoice("idle");
                  } else speak();
                }}
              >
                {voice === "playing" ? "إيقاف الصوت" : "أعد سماع المعلّم"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
