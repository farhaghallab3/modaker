"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import { TAJWEED_KIND_LABEL, noteWord, tajweedNoteText, type TajweedNote, type TajweedResult } from "@/lib/recitation/tajweed-notes";
import { playClip, stopTeacher } from "@/lib/recitation/teacher-voice";

export const noteId = (n: Pick<TajweedNote, "ayah" | "word">) => `${n.ayah}:${n.word}`;

export type TajweedState = { state: "checking" } | { state: "done"; result: TajweedResult } | { state: "failed" };

/**
 * «ملاحظات التجويد»: word by word, where the letters, harakat or tajweed differ from the correct Hafs reading,
 * as heard by the open Quran Muaalem model. Hints, not a ruling: the learner's sheikh has the final word.
 * The word itself comes from Modaker's verified text; the sentences are fixed (tajweed-notes.ts).
 * Each word can be heard alone from a human reciter; the note the teacher is talking about is highlighted.
 */
export function TajweedNotes({
  tajweed,
  ayahText,
  canListen,
  onListenAyah,
  wordUrl,
  speakingId = null,
}: {
  tajweed: TajweedState;
  ayahText: (ayah: number) => string | undefined;
  canListen: (ayah: number) => boolean;
  onListenAyah: (ayah: number) => void;
  /** The word alone in a reciter's voice (null when it cannot be placed safely). */
  wordUrl: (n: TajweedNote) => string | null;
  speakingId?: string | null;
}) {
  const result = tajweed.state === "done" ? tajweed.result : null;
  const listenFor = result ? [...new Set(result.notes.map((n) => n.ayah))].filter(canListen).slice(0, 3) : [];

  return (
    <section aria-label="ملاحظات التجويد" className="mb-6 rounded-[var(--radius-card)] bg-paper px-5 py-4 ring-1 ring-line animate-rise">
      <div className="flex items-center gap-2">
        <Icon name="mic" size={17} className="text-olive" />
        <h2 className="text-sm font-semibold text-forest">ملاحظات التجويد</h2>
        <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[0.7rem] text-sand-700">تجريبي</span>
      </div>

      <div role="status" aria-live="polite" className="mt-2">
        {tajweed.state === "checking" ? (
          <p className="text-sm text-muted animate-pulse">أستمع إلى تجويدك الآن… لحظات.</p>
        ) : tajweed.state === "failed" ? (
          <p className="text-sm text-muted">تعذّر فحص التجويد هذه المرة. جرّب مرة أخرى بعد قليل.</p>
        ) : result && result.matched === 0 ? (
          <p className="text-sm text-muted">لم أستطع فحص التجويد في هذا التسجيل. اقرأ بتأنٍّ وبصوت واضح، ثم أعد المحاولة.</p>
        ) : result && result.notes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-forest">
            <Icon name="checkCircle" size={17} className="text-olive" />
            لم أجد ملاحظات في الحروف والحركات والتجويد فيما سمعته. بارك الله فيك.
          </p>
        ) : result ? (
          <ul className="mt-1 space-y-3">
            {result.notes.map((n) => {
              const word = noteWord(n, ayahText(n.ayah));
              const url = word ? wordUrl(n) : null;
              const now = speakingId === noteId(n);
              return (
                <li
                  key={noteId(n)}
                  aria-current={now || undefined}
                  className={`rounded-xl px-3 py-2 transition-colors ${now ? "bg-olive-100 ring-2 ring-olive/60" : "bg-parchment"}`}
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold text-forest">الآية {toArabicDigits(n.ayah)}</span>
                    {word ? (
                      <span className="font-quran text-lg leading-8 text-ink">«{word}»</span>
                    ) : (
                      <span className="text-muted">الكلمة {toArabicDigits(n.word + 1)}</span>
                    )}
                    <span className="rounded-full bg-olive-100 px-2 text-[0.7rem] text-olive">{TAJWEED_KIND_LABEL[n.kind]}</span>
                  </p>
                  <p className="mt-1 text-sm leading-7 text-ink/85">{tajweedNoteText(n)}</p>
                  {url ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopTeacher();
                        void playClip(url);
                      }}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-xs font-semibold text-forest ring-1 ring-line hover:bg-olive-100"
                    >
                      <Icon name="play" size={13} />
                      اسمع الكلمة من الشيخ
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {listenFor.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {listenFor.map((n) => (
            <Button key={n} size="sm" variant="secondary" icon="play" onClick={() => onListenAyah(n)}>
              استمع للشيخ: الآية {toArabicDigits(n)}
            </Button>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[0.72rem] leading-5 text-muted">
        فحص آلي تجريبي بنموذج مفتوح (Quran Muaalem) على رواية حفص، وقد يخطئ. القول الفصل لشيخك.
      </p>
    </section>
  );
}
