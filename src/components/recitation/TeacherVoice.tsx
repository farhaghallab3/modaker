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

/** What follows the result sentence once the tajweed check answers (used when the full teacher script is unavailable). */
export type TeacherFollowUp = { phrase: TeacherPhraseKey } | { talk: TeacherTalkItem[] };

/** One step of the teacher's script: a sentence in the teacher's voice, or the Quran from a human reciter. */
export type TeacherItem =
  | { kind: "say"; text: string; clip: Promise<string | null> }
  | { kind: "word"; id: string; url: string | null }
  | { kind: "ayah"; url: string | null };

/** The full script: being written, ready, or unavailable (then the short follow-up is used). */
export type TeacherScriptState = { state: "waiting" } | { state: "ready"; items: TeacherItem[] } | { state: "failed" };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  script = null,
  onSpeaking,
}: {
  analysis: RecitationAnalysis;
  /** Said right after the result sentence once the tajweed check answers (null: nothing more to say). */
  followUp?: TeacherFollowUp | null;
  /** The teacher's full script (praise, what was read and skipped, each word to fix with the reciter). */
  script?: TeacherScriptState | null;
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
  const scriptOn = key === "unheard" ? null : script;
  const scriptRef = useRef(scriptOn);
  scriptRef.current = scriptOn;
  const waitSaid = useRef(false);
  const busy = useRef(false);
  const [line, setLine] = useState<string | null>(null);
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

  // The full script: sentences in the teacher's voice (shown as they are said), and the Quran from the reciter.
  const playScript = async (g: number, items: TeacherItem[]) => {
    followSaid.current = true;
    setVoice("playing");
    for (const it of items) {
      if (!live(g)) return;
      if (it.kind === "say") {
        setLine(it.text);
        const clip = await it.clip;
        if (!live(g)) return;
        if (clip && (await playClip(clip))) hadVoice.current = true;
        else if (!clip) await pause(Math.min(7000, 1500 + it.text.length * 55)); // no voice: time to read it
      } else if (it.url) {
        if (it.kind === "word") speakingRef.current?.(it.id);
        await playClip(it.url);
        speakingRef.current?.(null);
        if (live(g)) await pause(250);
      }
    }
    finish(g);
  };

  // After the result sentence: the full script when it is ready; while it is being written, a short «one moment»;
  // without it, the tajweed sentence or the notes one by one.
  const sayFollowUp = async (g: number) => {
    if (busy.current || followSaid.current || !live(g)) return;
    const sc = scriptRef.current;
    if (sc?.state === "ready") {
      busy.current = true;
      try {
        return await playScript(g, sc.items);
      } finally {
        busy.current = false;
      }
    }
    if (sc?.state === "waiting") {
      if (waitSaid.current) return;
      waitSaid.current = true;
      busy.current = true;
      setVoice("playing");
      if (await sayPhrase("teacherWait")) hadVoice.current = true;
      busy.current = false;
      if (!live(g)) return;
      if (scriptRef.current?.state === "waiting") return setVoice(hadVoice.current ? "idle" : "none");
      return sayFollowUp(g);
    }
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
    if (again) {
      followSaid.current = false;
      setLine(null);
    }
    firstDone.current = false;
    setVoice("playing");
    const ok = await sayPhrase(key);
    if (!live(g)) return;
    if (ok) hadVoice.current = true;
    firstDone.current = true;
    if (!ok && !hadVoice.current) setVoice("none");
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
    if ((follow || scriptOn) && firstDone.current && !followSaid.current && live(runGen.current)) void sayFollowUp(runGen.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, scriptOn]);

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
            {follow && "phrase" in follow && scriptOn?.state !== "ready" ? <> {TEACHER_PHRASES[follow.phrase]}</> : null}
          </p>
          {line ? (
            <p aria-live="polite" className="mt-2 rounded-xl bg-paper/80 px-3 py-2 text-[0.98rem] leading-8 text-forest animate-rise">
              {line}
            </p>
          ) : scriptOn?.state === "waiting" ? (
            <p className="mt-2 text-sm text-muted animate-pulse">الشيخ يستمع إلى تلاوتك…</p>
          ) : null}
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
