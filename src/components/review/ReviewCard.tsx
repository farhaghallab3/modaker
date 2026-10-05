"use client";

import { Icon } from "@/components/ui/Icon";
import { ButtonLink, cn, ProgressBar } from "@/components/ui/primitives";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { ayahCountLabel, daysFromNow, percentLabel, rangeLabel, relativeDueLabel } from "@/lib/review/labels";
import type { ReviewItem } from "@/lib/types";

/** One review range: what, when, how well — and the two ways in. */
export function ReviewCard({ item, now = new Date(), className }: { item: ReviewItem; now?: Date; className?: string }) {
  const meta = getSurahMeta(item.surah);
  const count = item.to - item.from + 1;
  const overdue = daysFromNow(item.dueAt, now) < 0;
  const due = item.bucket === "weak" && daysFromNow(item.dueAt, now) > 0 ? "الآن" : relativeDueLabel(item.dueAt, now);
  const weak = item.bucket === "weak";
  const reciteHref = `/recite?surah=${item.surah}&from=${item.from}&to=${item.to}&mode=review`;

  return (
    <article
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] bg-white/75 ring-1 p-4 sm:p-5 transition-shadow hover:shadow-[var(--shadow-soft)]",
        weak ? "ring-sand/50" : "ring-line",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-tight text-forest">سورة {meta?.nameAr}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {rangeLabel(item.from, item.to)} · {ayahCountLabel(count)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
            overdue || weak ? "bg-sand-100 text-sand-700" : item.bucket === "today" ? "bg-olive-100 text-olive-600" : "bg-parchment text-muted",
          )}
        >
          <Icon name="calendar" size={13} />
          {due}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {item.avgAccuracy != null ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted w-16 shrink-0">الدقة</span>
            <ProgressBar
              value={item.avgAccuracy}
              tone={item.avgAccuracy >= 0.9 ? "forest" : item.avgAccuracy >= 0.75 ? "olive" : "sand"}
              label={`متوسط دقة التسميع ${percentLabel(item.avgAccuracy)}`}
              className="flex-1"
            />
            <span className="text-xs text-ink/70 num w-10 text-end">{percentLabel(item.avgAccuracy)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted">لم تُسمَّع بعد — أول تسميع يضبط موعد المراجعة.</p>
        )}
        <p className="text-xs text-muted">
          {item.mistakes ? (
            <>
              <span className="text-ink/70 num">{toArabicDigits(item.mistakes)}</span> {item.mistakes === 1 ? "ملاحظة" : "ملاحظات"} في التسميعات السابقة
            </>
          ) : (
            "بلا أخطاء مسجّلة"
          )}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <ButtonLink href={reciteHref} size="sm" icon="mic" className="flex-1 sm:flex-none" aria-label={`سمّع الآن سورة ${meta?.nameAr} ${rangeLabel(item.from, item.to)}`}>
          سمّع الآن
        </ButtonLink>
        <ButtonLink
          href={`/quran/${item.surah}#ayah-${item.from}`}
          size="sm"
          variant="ghost"
          icon="mushaf"
          aria-label={`اقرأ سورة ${meta?.nameAr} ${rangeLabel(item.from, item.to)}`}
        >
          اقرأ
        </ButtonLink>
      </div>
    </article>
  );
}
