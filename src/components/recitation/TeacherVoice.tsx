"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import { TEACHER_PHRASES, ayahsToRepeat, teacherFeedback, type TeacherPhraseKey } from "@/lib/recitation/coach-feedback";
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
  followUp = null,
}: {
  analysis: RecitationAnalysis;
  /** Said right after the result sentence once the tajweed check answers (null: no tajweed sentence). */
  followUp?: TeacherPhraseKey | null;
  canListen: (ayah: number) => boolean;
  onListenAyah: (ayah: number) => void;
  onRetry: () => void;
}) {
  const { key, text } = useMemo(() => teacherFeedback(analysis), [analysis]);
  const [voice, setVoice] = useState<"idle" | "playing" | "none">("idle");
  const spoke = useRef(false);

  // The tajweed sentence follows the result sentence: right after it ends, or when the check answers later.
  const follow = key === "unheard" ? null : followUp;
  const firstDone = useRef(false);
  const followSaid = useRef(false);
  const interrupted = useRef(false);
  const hadVoice = useRef(false);
  const followRef = useRef(follow);
  followRef.current = follow;

  const sayFollowUp = () => {
    const f = followRef.current;
    if (!f || followSaid.current || interrupted.current) return;
    followSaid.current = true;
    setVoice("playing");
    void playTeacher(f, () => setVoice("idle")).then((ok) => !ok && setVoice(hadVoice.current ? "idle" : "none"));
  };

  const speak = (withFollowUp = false) => {
    setVoice("playing");
    if (withFollowUp) followSaid.current = false;
    void playTeacher(key, () => {
      setVoice("idle");
      firstDone.current = true;
      sayFollowUp();
    }).then((ok) => {
      if (ok) {
        hadVoice.current = true;
        return;
      }
      setVoice("none");
      firstDone.current = true;
    });
  };

  useEffect(() => {
    if (!spoke.current) {
      spoke.current = true;
      speak();
    }
    return () => stopTeacher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (follow && firstDone.current) sayFollowUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);

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
            {follow ? <> {TEACHER_PHRASES[follow]}</> : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {repeat.map((n) => (
              <Button
                key={n}
                size="sm"
                variant="secondary"
                icon="play"
                onClick={() => {
                  interrupted.current = true;
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
                    interrupted.current = true;
                    stopTeacher();
                    setVoice("idle");
                  } else {
                    interrupted.current = false;
                    speak(true);
                  }
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
