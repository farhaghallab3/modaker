"use client";

import { useMemo, useState } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { ReviewCard } from "@/components/review/ReviewCard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { ayahCountLabel, rangeLabel } from "@/lib/review/labels";
import { useApp } from "@/lib/store/AppProvider";
import { reviewQueue, todaysWird } from "@/lib/store/selectors";
import type { ReviewBucket, ReviewItem } from "@/lib/types";

const SECTIONS: { bucket: ReviewBucket; title: string; hint: string; icon: IconName; limit: number }[] = [
  { bucket: "today", title: "مراجعة اليوم", hint: "حان موعدها — أنفع وقت لتثبيتها الآن.", icon: "calendar", limit: Infinity },
  { bucket: "weak", title: "تحتاج مراجعة", hint: "مواضع تعثّرت فيها مؤخرًا؛ نقدّمها لك أولًا.", icon: "review", limit: Infinity },
  { bucket: "mastered", title: "متقن", hint: "ثابتة بفضل الله؛ نراجعها على فترات متباعدة.", icon: "checkCircle", limit: 6 },
  { bucket: "upcoming", title: "مراجعات قادمة", hint: "مجدولة لأيام قادمة.", icon: "clock", limit: 6 },
];

const MIN_PER_AYAH = 0.5;

export function ReviewScreen() {
  const { state } = useApp();
  const now = useMemo(() => new Date(), []);
  const queue = useMemo(() => reviewQueue(state, now), [state, now]);
  const [expanded, setExpanded] = useState<Partial<Record<ReviewBucket, boolean>>>({});
  // Reviews the learner just assessed: their card leaves the due list, so keep what they should read.
  const [justReviewed, setJustReviewed] = useState<{ item: ReviewItem; message: string }[]>([]);
  const onSelfReviewed = (item: ReviewItem, message: string) =>
    setJustReviewed((list) => [...list.filter((x) => !(x.item.surah === item.surah && x.item.from === item.from && x.item.to === item.to)), { item, message }]);

  const byBucket = useMemo(() => {
    const m: Record<ReviewBucket, ReviewItem[]> = { today: [], weak: [], mastered: [], upcoming: [] };
    for (const item of queue) m[item.bucket].push(item);
    m.upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    m.mastered.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return m;
  }, [queue]);

  const dueItems = [...byBucket.weak, ...byBucket.today];
  const dueAyahs = dueItems.reduce((s, r) => s + (r.to - r.from + 1), 0);
  const minutes = Math.max(1, Math.round(dueAyahs * MIN_PER_AYAH));
  const first = [...dueItems].sort((a, b) => b.priority - a.priority)[0];
  const wird = todaysWird(state);

  if (!queue.length) {
    return (
      <Page narrow>
        <PageHeader eyebrow="المراجعة" title="مراجعاتك" />
        <EmptyState
          icon="leaf"
          title="لا مراجعات بعد"
          body="عندما تحفظ آيات، نجدول مراجعتها تلقائيًا على فترات تتباعد كلما أتقنتها."
          action={
            wird ? (
              <ButtonLink href={`/memorize/${wird.surah}?from=${wird.from}&to=${wird.to}`} icon="leaf">
                ابدأ ورد اليوم
              </ButtonLink>
            ) : (
              <ButtonLink href="/quran" icon="mushaf">
                اختر سورة لتحفظها
              </ButtonLink>
            )
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="المراجعة"
        title="مراجعاتك"
        description="نراجع كل آية على فترات تتباعد كلما أتقنتها، وتقترب إذا تعثّرت — فتراجع ما يحتاج فقط."
      />

      {/* ── Today summary ───────────────────────────────────────── */}
      {dueItems.length ? (
        <section
          aria-label="ملخص اليوم"
          className="relative overflow-hidden rounded-[var(--radius-card)] bg-forest text-cream mb-10 animate-rise"
        >
          <div aria-hidden className="pattern-girih absolute inset-0 opacity-25" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 p-5 sm:p-7">
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-cream/70">مراجعات اليوم</p>
                <p className="mt-1 text-4xl font-semibold num">{toArabicDigits(dueItems.length)}</p>
                <p className="text-xs text-cream/70">{ayahCountLabel(dueAyahs)}</p>
              </div>
              <div>
                <p className="text-xs text-cream/70">الوقت المتوقع</p>
                <p className="mt-1 text-4xl font-semibold num">
                  {toArabicDigits(minutes)}
                  <span className="text-base font-normal text-cream/80"> دقيقة</span>
                </p>
                <p className="text-xs text-cream/70">تقريبًا</p>
              </div>
            </div>
            {first ? (
              <div className="sm:ms-auto">
                <ButtonLink
                  href={`/recite?surah=${first.surah}&from=${first.from}&to=${first.to}&mode=review`}
                  variant="onDark"
                  className="w-full sm:w-auto"
                  icon="mic"
                >
                  ابدأ بسورة {getSurahMeta(first.surah)?.nameAr}
                </ButtonLink>
                <p className="mt-1.5 text-xs text-cream/70 text-center sm:text-start">{rangeLabel(first.from, first.to)}</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="mb-10 rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25">
          <EmptyState
            icon="checkCircle"
            title="لا مراجعات اليوم"
            body="أنهيت ما عليك — بارك الله فيك. استثمر وقتك في ورد جديد."
            action={
              wird ? (
                <ButtonLink href={`/memorize/${wird.surah}?from=${wird.from}&to=${wird.to}`} icon="leaf">
                  احفظ وردك التالي · سورة {getSurahMeta(wird.surah)?.nameAr} {rangeLabel(wird.from, wird.to)}
                </ButtonLink>
              ) : null
            }
          />
        </section>
      )}

      {justReviewed.length ? (
        <section aria-label="راجعتها الآن" className="mb-10 space-y-2">
          {justReviewed.map(({ item, message }) => (
            <p key={`${item.surah}:${item.from}-${item.to}`} role="status" className="rounded-[var(--radius-card)] bg-olive-100/60 px-4 py-3 text-sm leading-7 text-ink/85">
              <strong className="text-forest">
                سورة {getSurahMeta(item.surah)?.nameAr} · {rangeLabel(item.from, item.to)}:
              </strong>{" "}
              {message}
            </p>
          ))}
        </section>
      ) : null}

      <div className="space-y-10">
        {SECTIONS.map((sec) => {
          const items = byBucket[sec.bucket];
          if (!items.length) return null;
          const open = expanded[sec.bucket];
          const shown = open ? items : items.slice(0, sec.limit);
          return (
            <section key={sec.bucket} aria-labelledby={`sec-${sec.bucket}`}>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 id={`sec-${sec.bucket}`} className="flex items-center gap-2 text-lg font-semibold text-forest">
                    <Icon name={sec.icon} size={19} className="text-olive" />
                    {sec.title}
                    <span className="text-sm font-normal text-muted num">({toArabicDigits(items.length)})</span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">{sec.hint}</p>
                </div>
              </div>
              <ul className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shown.map((item) => (
                  <li key={`${item.surah}:${item.from}-${item.to}`}>
                    <ReviewCard item={item} now={now} className="h-full" onSelfReviewed={onSelfReviewed} />
                  </li>
                ))}
              </ul>
              {items.length > shown.length || (open && items.length > sec.limit) ? (
                <div className="mt-3 flex justify-center">
                  <Button variant="quiet" size="sm" onClick={() => setExpanded((e) => ({ ...e, [sec.bucket]: !open }))}>
                    {open ? "عرض أقل" : `عرض الكل (${toArabicDigits(items.length)})`}
                  </Button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </Page>
  );
}
