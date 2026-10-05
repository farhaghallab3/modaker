"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge, ButtonLink, cn, ProgressBar } from "@/components/ui/primitives";
import { revelationLabel, toArabicDigits } from "@/lib/quran/surahs";
import { ayahCountLabel, percentLabel } from "@/lib/review/labels";
import type { SurahMeta } from "@/lib/types";

/**
 * One surah in the browser grid. The whole card is a link (stretched heading
 * link) while "متابعة" stays a separate, real control above it.
 */
export function SurahCard({
  meta,
  memorized,
  continueHref,
  className,
}: {
  meta: SurahMeta;
  /** memorized ayah count */
  memorized: number;
  /** when the learner is mid-surah: where "متابعة" goes */
  continueHref?: string;
  className?: string;
}) {
  const ratio = meta.ayahCount ? memorized / meta.ayahCount : 0;
  const complete = ratio >= 1;
  const started = memorized > 0;
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line p-4 sm:p-5 transition-[box-shadow,transform] duration-200",
        "hover:shadow-[var(--shadow-soft)] hover:ring-sage focus-within:ring-olive/50 motion-safe:hover:-translate-y-px",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        {/* octagonal number badge */}
        <span
          aria-hidden
          className={cn(
            "relative grid place-items-center size-11 shrink-0 text-sm font-semibold num",
            complete ? "text-cream" : "text-forest",
          )}
        >
          <svg viewBox="0 0 44 44" className="absolute inset-0 size-full">
            <path
              d="M22 2l6 4.5h7.5V14L40 22l-4.5 8v7.5H28L22 42l-6-4.5H8.5V30L4 22l4.5-8V6.5H16z"
              className={complete ? "fill-forest" : started ? "fill-olive-100" : "fill-parchment"}
            />
          </svg>
          <span className="relative">{toArabicDigits(meta.number)}</span>
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="leading-none">
            <Link
              href={`/quran/${meta.number}`}
              className="font-display text-[1.6rem] text-forest focus:outline-none after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-['']"
            >
              سورة {meta.nameAr}
            </Link>
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span lang="en" dir="ltr" className="tracking-wide">
              {meta.nameEn}
            </span>
            <span aria-hidden className="size-1 rounded-full bg-line" />
            <span>{ayahCountLabel(meta.ayahCount)}</span>
            <span aria-hidden className="size-1 rounded-full bg-line" />
            <span>{revelationLabel(meta.revelation)}</span>
          </p>
        </div>

        {complete ? (
          <Badge tone="forest" className="shrink-0">
            <Icon name="check" size={13} />
            محفوظة
          </Badge>
        ) : null}
      </div>

      {started ? (
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar
            value={ratio}
            tone={complete ? "forest" : "olive"}
            label={`نسبة حفظ سورة ${meta.nameAr}`}
            className="flex-1"
          />
          <span className="text-xs text-muted num shrink-0">
            {toArabicDigits(memorized)}/{toArabicDigits(meta.ayahCount)} · {percentLabel(ratio)} من الحفظ
          </span>
        </div>
      ) : null}

      {continueHref && !complete ? (
        <div className="relative z-10 mt-4 flex justify-end">
          <ButtonLink href={continueHref} size="sm" variant="secondary" iconEnd="forward" aria-label={`متابعة حفظ سورة ${meta.nameAr}`}>
            متابعة
          </ButtonLink>
        </div>
      ) : null}
    </article>
  );
}

export function SurahCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] ring-1 ring-line p-5 bg-white/50" aria-hidden>
      <div className="flex gap-3.5">
        <div className="skeleton size-11 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <div className="skeleton h-6 w-1/2" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}
