"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import { TEACHER_PHRASES, ayahsToRepeat, teacherFeedback, type TeacherPhraseKey } from "@/lib/recitation/coach-feedback";
import { playClip, sayPhrase, stopTeacher, teacherGeneration } from "@/lib/recitation/teacher-voice";
import type { RecitationAnalysis } from "@/lib/types";

/** One tajweed note the teacher goes through out loud: its sentence (audio being fetched) and the word in the reciter's voice. */
export interface TeacherTalkItem {
  id: string;
  /** Object URL of the teacher's sentence for this note, or null when it could not be voiced. */
  clip: Promise<string | null>;
  /** The word alone, recited by a human reciter (null when the word cannot be placed safely). */
  wordUrl: string | null;
}

/** What follows the result sentence once the tajweed check answers. */
export type TeacherFollowUp = { phrase: TeacherPhraseKey } | { talk: TeacherTalkItem[] };

/**
 * «المعلّم»: the moment a recitation is checked, the teacher says the result out loud (a short fixed sentence, prepared
 * while the learner was reciting) and shows it with the ayah numbers. Then: the REAL reciter for each ayah to fix, and
 * a retry. The Quran itself is only ever heard in a human reciter's voice.
 * When the tajweed check found something, the teacher then goes through the first notes one by one: where (ayah
 * and word number), what to fix (letter, vowel, rule), and the word itself from a human reciter.
 */
export function TeacherVoice({
  analysis,
  canListen,
  onListenAyah,
  onRetry,
  followUp = null,
  onSpeaking,
}: {
  analysis: RecitationAnalysis;
  /** Said right after the result sentence once the tajweed check answers (null: nothing more to say). */
  followUp?: TeacherFollowUp | null;
  canListen: (ayah: number) => boolean;
  onListenAyah: (ayah: number) => void;
  onRetry: () => void;
  /** The note the teacher is talking about now (to highlight it), or null. */
  onSpeaking?: (id: string | null) => void;
}) {
  const { key, text } = useMemo(() => teacherFeedback(analysis), [analysis]);
  const [voice, setVoice] = useState<"idle" | "playing" | "none">("idle");
  const spoke = useRef(false);

  const follow = key === "unheard" ? null : followUp;
  const followRef = useRef(follow);
  followRef.current = follow;
  const speakingRef = useRef(onSpeaking);
  speakingRef.current = onSpeaking;
  const firstDone = useRef(false);
  const followSaid = useRef(false);
  const hadVoice = useRef(false);
  const runGen = useRef(-1); // the teacher generation this card is speaking in (stopping changes it)

  const live = (g: number) => g === teacherGeneration();
  const finish = (g: number) => {
    if (!live(g)) return;
    speakingRef.current?.(null);
    setVoice(hadVoice.current ? "idle" : "none");
  };

  // After the result sentence: the tajweed sentence, or the notes one by one like a sheikh going through them.
  const sayFollowUp = async (g: number) => {
    const f = followRef.current;
    if (!f || followSaid.current || !live(g)) return finish(g);
    followSaid.current = true;
    setVoice("playing");
    if ("phrase" in f) {
      if (await sayPhrase(f.phrase)) hadVoice.current = true;
      return finish(g);
    }
    await sayPhrase("tajweedIntro");
    for (const item of f.talk) {
      if (!live(g)) return;
      speakingRef.current?.(item.id);
      const clip = await item.clip;
      if (!live(g)) return;
      if (!clip) {
        // The voice service could not say this note: say the written-notes sentence instead and stop here.
        await sayPhrase("tajweedFix");
        return finish(g);
      }
      if (await playClip(clip)) hadVoice.current = true;
      if (item.wordUrl && live(g)) {
        await sayPhrase("hearSheikh");
        if (live(g)) await playClip(item.wordUrl);
      }
    }
    if (live(g)) {
      speakingRef.current?.(null);
      await sayPhrase("tajweedEnd");
    }
    finish(g);
  };

  const speak = async (again = false) => {
    stopTeacher();
    const g = teacherGeneration();
    runGen.current = g;
    if (again) followSaid.current = false;
    firstDone.current = false;
    setVoice("playing");
    const ok = await sayPhrase(key);
    if (!live(g)) return;
    if (ok) hadVoice.current = true;
    firstDone.current = true;
    if (!ok && !hadVoice.current) return setVoice("none");
    await sayFollowUp(g);
  };

  const stop = () => {
    stopTeacher();
    speakingRef.current?.(null);
    setVoice(hadVoice.current ? "idle" : "none");
  };

  useEffect(() => {
    if (!spoke.current) {
      spoke.current = true;
      void speak();
    }
    return () => stopTeacher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The check answered after the result sentence ended: go on, unless the learner stopped the teacher meanwhile.
  useEffect(() => {
    if (follow && firstDone.current && !followSaid.current && live(runGen.current)) void sayFollowUp(runGen.current);
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
            {follow && "phrase" in follow ? <> {TEACHER_PHRASES[follow.phrase]}</> : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {repeat.map((n) => (
              <Button
                key={n}
                size="sm"
                variant="secondary"
                icon="play"
                onClick={() => {
                  stop();
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
                onClick={() => (voice === "playing" ? stop() : void speak(true))}
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
