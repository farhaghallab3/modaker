"use client";

import { Fragment, useState, type ReactNode } from "react";
import { QuranVerse } from "@/components/quran/QuranVerse";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, cn } from "@/components/ui/primitives";
import { CitationMarker, SourceList } from "@/components/ui/SourceCitation";
import { getSurahMeta } from "@/lib/quran/surahs";
import type { AssistantAnswer, Ayah, Citation } from "@/lib/types";

/** Quizzes come back as kind "quran-text" from the quiz provider (verses attached for reveal). */
export function isQuiz(a: AssistantAnswer) {
  return a.kind === "quran-text" && a.provider.startsWith("quiz");
}

/** Splits answer text into paragraphs and turns [n] into linked citation markers. */
function RichText({ text, citations, idPrefix }: { text: string; citations: Citation[]; idPrefix: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.split("\n"));
  return (
    <div className="space-y-3">
      {paragraphs.map((lines, pi) => (
        <p key={pi} className="leading-8 text-[0.95rem] text-ink/90">
          {lines.map((line, li) => (
            <Fragment key={li}>
              {li > 0 ? <br /> : null}
              {line.split(/(\[\d{1,2}\])/g).map((part, k) => {
                const m = /^\[(\d{1,2})\]$/.exec(part);
                if (m) {
                  const n = Number(m[1]);
                  return n >= 1 && n <= citations.length ? (
                    <CitationMarker key={k} n={n} targetId={`${idPrefix}-src-${n}`} title={citations[n - 1].title} />
                  ) : null;
                }
                return <Fragment key={k}>{part}</Fragment>;
              })}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

/** Verified verses grouped by surah, flowing like a mushaf line. */
export function VersePanel({ verses, hidden = false, className }: { verses: Ayah[]; hidden?: boolean; className?: string }) {
  const groups: { surah: number; ayahs: Ayah[] }[] = [];
  for (const v of verses) {
    const g = groups[groups.length - 1];
    if (g && g.surah === v.surah) g.ayahs.push(v);
    else groups.push({ surah: v.surah, ayahs: [v] });
  }
  return (
    <div className={cn("rounded-2xl bg-paper ring-1 ring-line px-4 sm:px-5 py-4", className)}>
      {groups.map((g) => (
        <div key={g.surah} className="[&+&]:mt-4">
          <p className="text-xs text-olive font-medium mb-1">سورة {getSurahMeta(g.surah)?.nameAr}</p>
          <p className="text-start" lang="ar" dir="rtl">
            {g.ayahs.map((a) => (
              <QuranVerse key={a.key} ayah={a} as="span" hidden={hidden} className="text-[1.35rem] sm:text-[1.5rem] leading-[2.2]" />
            ))}
          </p>
        </div>
      ))}
    </div>
  );
}

function Frame({
  icon,
  tone,
  title,
  children,
}: {
  icon: IconName;
  tone: "calm" | "scholar" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    calm: "bg-parchment/70",
    scholar: "bg-cream ring-1 ring-sand/30",
    warn: "bg-terracotta-50/70",
  } as const;
  const iconTone = { calm: "text-olive", scholar: "text-sand-700", warn: "text-terracotta" } as const;
  return (
    <div className={cn("rounded-2xl px-4 py-4 sm:px-5", tones[tone])}>
      <div className="flex gap-3">
        <Icon name={icon} size={20} className={cn("mt-1", iconTone[tone])} />
        <div className="min-w-0 flex-1 space-y-2">
          {title ? <p className="font-semibold text-forest">{title}</p> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Client-side failure answers use provider "client:<reason>" (see AIChat). */
const UNAVAILABLE_TITLES: Record<string, string> = {
  "client:rate_limited": "تمهّل قليلًا",
  "client:offline": "لا يوجد اتصال بالإنترنت",
  "client:error": "تعذّرت الإجابة الآن",
};

export function AnswerView({
  answer,
  idPrefix,
  onRetry,
}: {
  answer: AssistantAnswer;
  idPrefix: string;
  onRetry?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const sources = (
    <SourceList
      items={answer.citations}
      idPrefix={`${idPrefix}-src`}
      title={answer.kind === "insufficient" ? "ما اطّلعتُ عليه من المصادر" : answer.kind === "needs-scholar" ? "مصادر ذات صلة" : "المصادر"}
      className="pt-1"
    />
  );

  switch (answer.kind) {
    case "grounded":
      return (
        <div className="space-y-4">
          <RichText text={answer.text} citations={answer.citations} idPrefix={idPrefix} />
          {answer.verses?.length ? <VersePanel verses={answer.verses} /> : null}
          {sources}
        </div>
      );

    case "insufficient":
      return (
        <div className="space-y-4">
          <Frame icon="info" tone="calm">
            <RichText text={answer.text} citations={answer.citations} idPrefix={idPrefix} />
          </Frame>
          {answer.verses?.length ? <VersePanel verses={answer.verses} /> : null}
          {sources}
        </div>
      );

    case "needs-scholar":
      return (
        <div className="space-y-4">
          <Frame icon="shield" tone="scholar" title="سؤال يحتاج إلى أهل العلم">
            <RichText text={answer.text} citations={answer.citations} idPrefix={idPrefix} />
          </Frame>
          {answer.verses?.length ? <VersePanel verses={answer.verses} /> : null}
          {sources}
        </div>
      );

    case "quran-text": {
      const quiz = isQuiz(answer);
      return (
        <div className="space-y-4">
          <RichText text={answer.text} citations={answer.citations} idPrefix={idPrefix} />
          {answer.verses?.length ? (
            quiz ? (
              <div className="space-y-3">
                <Button
                  variant={revealed ? "ghost" : "secondary"}
                  size="sm"
                  icon={revealed ? "eyeOff" : "eye"}
                  aria-expanded={revealed}
                  aria-controls={`${idPrefix}-answer`}
                  onClick={() => setRevealed((r) => !r)}
                >
                  {revealed ? "إخفاء الإجابة" : "إظهار الإجابة"}
                </Button>
                <div id={`${idPrefix}-answer`}>
                  <VersePanel verses={answer.verses} hidden={!revealed} />
                  {!revealed ? <p className="sr-only">الإجابة مخفية. اضغط «إظهار الإجابة» لعرض الآيات.</p> : null}
                </div>
              </div>
            ) : (
              <VersePanel verses={answer.verses} />
            )
          ) : null}
          {sources}
        </div>
      );
    }

    case "unavailable":
    default:
      return (
        <Frame
          icon={answer.provider === "client:rate_limited" ? "clock" : "wifiOff"}
          tone="warn"
          title={UNAVAILABLE_TITLES[answer.provider] ?? "المصدر الموثّق غير متاح الآن"}
        >
          <p className="text-sm leading-7 text-ink/80">{answer.text}</p>
          {onRetry ? (
            <Button variant="ghost" size="sm" icon="review" onClick={onRetry} className="mt-1">
              إعادة المحاولة
            </Button>
          ) : null}
        </Frame>
      );
  }
}
