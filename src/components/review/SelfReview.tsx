"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button, cn } from "@/components/ui/primitives";
import { useSurah } from "@/lib/api";
import { toArabicDigits } from "@/lib/quran/surahs";
import { SELF_GRADES, selfReviewMessage } from "@/lib/review/labels";
import { useApp } from "@/lib/store/AppProvider";
import { applySelfReviewRange } from "@/lib/store/reducers";
import type { AyahRange, SelfGrade } from "@/lib/types";

const FOOTNOTE = "هذا تقييمك أنت، وليس تحقّقًا من تلاوتك. التسميع هو ما يثبّت الإتقان.";

/** The three choices. Applies the grade to every range in `ranges` and reports what the learner should read. */
export function SelfGradeButtons({ ranges, onDone, className }: { ranges: AyahRange[]; onDone?: (message: string) => void; className?: string }) {
  const { state, actions } = useApp();
  const [message, setMessage] = useState<string | null>(null);

  function choose(grade: SelfGrade) {
    // Predict the outcome on the current state with the very same pure reducer the action runs.
    let probe = state;
    let stillNeedsRecitation = 0;
    const counts = { credited: 0, downgraded: 0, "same-day": 0, "not-due": 0, "recitation-today": 0, "not-memorized": 0 };
    for (const r of ranges) {
      const res = applySelfReviewRange(probe, r, grade);
      probe = res.state;
      stillNeedsRecitation += res.stillNeedsRecitation;
      for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] += res.counts[k];
      actions.recordSelfReview(r, grade);
    }
    const dates: string[] = [];
    for (const r of ranges) {
      for (let a = r.from; a <= r.to; a++) {
        const d = probe.progress[`${r.surah}:${a}`]?.nextReviewAt;
        if (d) dates.push(d);
      }
    }
    dates.sort();
    const text = selfReviewMessage(grade, counts, dates[0] ?? null, new Date(), stillNeedsRecitation);
    setMessage(text);
    onDone?.(text);
  }

  return (
    <div className={className}>
      <div role="group" aria-label="قيّم مراجعتك" className="grid gap-2 sm:grid-cols-3">
        {SELF_GRADES.map((g) => (
          <button
            key={g.grade}
            type="button"
            onClick={() => choose(g.grade)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-2xl px-3 py-3 text-center ring-1 transition-colors",
              g.grade === "solid" && "bg-olive-100 text-olive-600 ring-olive/20 hover:bg-sage",
              g.grade === "hesitated" && "bg-sand-100 text-sand-700 ring-sand/30 hover:bg-sand-100/70",
              g.grade === "forgot" && "bg-terracotta-50 text-terracotta ring-terracotta/20 hover:bg-terracotta-50/70",
            )}
          >
            <span className="font-display text-xl">{g.label}</span>
            <span className="text-xs leading-5 opacity-90">{g.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-6 text-muted">
        <Icon name="info" size={14} className="mt-1 shrink-0 text-olive" />
        {FOOTNOTE}
      </p>
      {message ? (
        <p role="status" aria-live="polite" className="mt-2 rounded-xl bg-parchment px-3 py-2 text-sm leading-7 text-ink/85">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Review without (or after) a recitation: try to recall first → optionally check the verified text →
 * assess yourself. The text is hidden until the learner chooses to look, to encourage recall before reading.
 */
export function SelfReviewPanel({ range, onClose, onDone }: { range: AyahRange; onClose: () => void; onDone?: (message: string) => void }) {
  const surah = useSurah(range.surah);
  const [reveal, setReveal] = useState(false);
  const verses = useMemo(() => (surah.data?.ayahs ?? []).filter((a) => a.ayah >= range.from && a.ayah <= range.to), [surah.data, range]);
  const ref = useRef<HTMLDivElement>(null);
  // the panel opens under the card buttons — bring it into view (important on phones)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div ref={ref} className="mt-4 scroll-mt-20 rounded-2xl bg-cream ring-1 ring-sand/30 p-4 animate-rise" role="region" aria-label="مراجعة دون تسميع">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-forest">حاول من حفظك أولًا</h4>
          <p className="mt-0.5 text-sm text-muted">اقرأ الآيات من ذاكرتك، ثم تحقّق منها إن أردت، ثم قيّم مراجعتك.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-muted hover:text-forest">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="mt-3">
        <Button variant={reveal ? "quiet" : "secondary"} size="sm" icon={reveal ? "eyeOff" : "eye"} onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
          {reveal ? "إخفاء الآيات" : "تحقّق من الآيات"}
        </Button>
        {reveal ? (
          <div className="mt-3 rounded-xl bg-white/80 ring-1 ring-line px-4 py-3">
            {surah.error ? (
              <p className="text-sm text-terracotta" role="alert">
                تعذّر تحميل الآيات الآن.
              </p>
            ) : !verses.length ? (
              <div className="skeleton h-10 w-full rounded-lg" />
            ) : (
              <p lang="ar" dir="rtl" className="quran-text">
                {verses.map((a) => (
                  <span key={a.key}>
                    {a.textUthmani} <span className="ayah-marker" aria-hidden>{toArabicDigits(a.ayah)}</span>{" "}
                  </span>
                ))}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <h4 className="mt-4 mb-2 font-semibold text-forest">كيف كانت مراجعتك؟</h4>
      <SelfGradeButtons ranges={[range]} onDone={onDone} />
    </div>
  );
}
