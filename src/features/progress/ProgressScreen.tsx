"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Badge, ButtonLink, cn, EmptyState, ProgressBar, ProgressRing, SectionHeader, Stat } from "@/components/ui/primitives";
import { ayahCount, dayCount, formatDate, n, percent } from "@/features/shared/format";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { needsReviewLabel } from "@/lib/review/labels";
import { latestAccuracy } from "@/lib/review/learning";
import { useApp } from "@/lib/store/AppProvider";
import {
  averageAccuracy,
  completedSurahs,
  lastNDays,
  memorizedCount,
  reviewQueue,
  streakDays,
  strongAyahs,
  surahProgress,
  surahsInProgress,
  today,
  weakAyahs,
  weeklyConsistency,
} from "@/lib/store/selectors";
import type { AyahProgress } from "@/lib/types";
import { WeeklyBars } from "./WeeklyBars";

/** Merge ayahs into contiguous per-surah ranges: [{surah, from, to}] */
function toRanges(list: AyahProgress[]) {
  const sorted = [...list].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  const out: { surah: number; from: number; to: number }[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last.surah === p.surah && last.to === p.ayah - 1) last.to = p.ayah;
    else out.push({ surah: p.surah, from: p.ayah, to: p.ayah });
  }
  return out;
}

function encouragement(streak: number, consistency: number) {
  if (streak >= 7) return "ما شاء الله، أسبوع كامل من الثبات. القليل الدائم خير من الكثير المنقطع.";
  if (streak >= 3) return "خطواتك متصلة — حافظ على هذا الإيقاع الهادئ.";
  if (consistency > 0) return "كل جلسة تبني على ما قبلها. عُد اليوم ولو بآية واحدة.";
  return "ابدأ بآية واحدة اليوم، وسنرافقك خطوة بخطوة.";
}

export function ProgressScreen() {
  const { state } = useApp();

  const data = useMemo(() => {
    const t = today(state);
    const due = reviewQueue(state).filter((r) => r.bucket === "today" || r.bucket === "weak");
    const dueAyahs = due.reduce((a, r) => a + (r.to - r.from + 1), 0);
    return {
      memorized: memorizedCount(state),
      surahsDone: completedSurahs(state),
      streak: streakDays(state),
      consistency: weeklyConsistency(state),
      accuracy: averageAccuracy(state),
      reviewCompletion: t.reviewed + dueAyahs ? t.reviewed / (t.reviewed + dueAyahs) : null,
      reviewedToday: t.reviewed,
      dueAyahs,
      week: lastNDays(state, 7),
      weak: weakAyahs(state),
      strong: strongAyahs(state),
      surahs: surahsInProgress(state).map((s) => ({ meta: getSurahMeta(s)!, ...surahProgress(state, s) })).filter((s) => s.meta),
      recitations: state.recitations.slice(0, 5),
    };
  }, [state]);

  const activeDays = data.week.filter((d) => d.memorized + d.reviewed + d.recitations > 0).length;

  if (!data.memorized && !data.surahs.length && !state.activity.length) {
    return (
      <Page>
        <PageHeader eyebrow="رحلتك" title="تقدّمك" />
        <EmptyState
          icon="leaf"
          title="رحلتك تبدأ بآية"
          body="حين تحفظ أول مقطع ستجد هنا ما حفظته، وثباتك خلال الأسبوع، ودقة تسميعك."
          action={<ButtonLink href="/quran">اختر سورة لتبدأ</ButtonLink>}
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow="رحلتك" title="تقدّمك" description="هذه خطواتك أنت، بلا مقارنة مع أحد. كل آية تحفظها نورٌ يبقى معك." />

      {/* ── Summary band ─────────────────────────────────────────── */}
      <section aria-label="ملخص التقدم" className="relative overflow-hidden rounded-[2rem] bg-forest text-cream px-6 py-7 sm:px-10 sm:py-9">
        <span className="pattern-girih absolute inset-0 opacity-[0.08]" aria-hidden />
        <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
          <div>
            <p className="text-sm text-cream/70">حفظت حتى الآن</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="font-display text-6xl sm:text-7xl leading-none num">{n(data.memorized)}</span>
              <span className="text-lg text-cream/80">آية</span>
            </p>
            <p className="mt-4 max-w-md text-sm leading-7 text-cream/75">{encouragement(data.streak, data.consistency)}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-cream/15 pt-6 md:border-t-0 md:border-s md:pt-0 md:ps-8">
            <div>
              <dt className="text-xs text-cream/65">سور أتممتها</dt>
              <dd className="mt-1 text-2xl font-semibold num">{n(data.surahsDone)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-cream/65">
                <Icon name="flame" size={14} className="text-sand" />
                أيام متتالية
              </dt>
              <dd className="mt-1 text-2xl font-semibold num">{n(data.streak)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream/65">سور قيد الحفظ</dt>
              <dd className="mt-1 text-2xl font-semibold num">{n(data.surahs.filter((s) => s.ratio < 1).length)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream/65">تسميعات</dt>
              <dd className="mt-1 text-2xl font-semibold num">{n(state.recitations.length)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Week + quality ───────────────────────────────────────── */}
      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="week-title">
          <SectionHeader
            title={<span id="week-title">هذا الأسبوع</span>}
            eyebrow={`نشطت ${dayCount(activeDays)} من سبعة`}
            className="mb-6"
          />
          <WeeklyBars days={data.week} />
        </section>

        <section aria-labelledby="quality-title" className="lg:border-s lg:hairline lg:ps-10">
          <h2 id="quality-title" className="text-lg font-semibold text-forest mb-6">
            جودة الحفظ
          </h2>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <ProgressRing value={data.consistency} label="الثبات الأسبوعي" size={60}>
                <span className="text-xs font-semibold text-forest num">{percent(data.consistency)}</span>
              </ProgressRing>
              <Stat label="الثبات الأسبوعي" value={`${n(activeDays)}/٧`} hint="أيام فيها حفظ أو مراجعة" />
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing value={data.accuracy ?? 0} label="دقة التسميع" size={60}>
                <span className="text-xs font-semibold text-forest num">{data.accuracy == null ? "—" : percent(data.accuracy)}</span>
              </ProgressRing>
              <Stat
                label="دقة التسميع"
                value={data.accuracy == null ? "—" : percent(data.accuracy)}
                hint={data.accuracy == null ? "سمّع مقطعًا لتظهر دقتك" : "مطابقة نصية لما حفظته"}
              />
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing value={data.reviewCompletion ?? 1} label="إنجاز مراجعة اليوم" size={60} tone="forest">
                <span className="text-xs font-semibold text-forest num">
                  {data.reviewCompletion == null ? "✓" : percent(data.reviewCompletion)}
                </span>
              </ProgressRing>
              <Stat
                label="مراجعة اليوم"
                value={data.reviewCompletion == null ? "لا شيء مستحق" : `${n(data.reviewedToday)} من ${n(data.reviewedToday + data.dueAyahs)}`}
                hint={data.dueAyahs ? `بقي ${ayahCount(data.dueAyahs)}` : "أنجزت ما عليك اليوم"}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ── Weak / strong ────────────────────────────────────────── */}
      <div className="mt-14 grid gap-10 md:grid-cols-2">
        <section aria-labelledby="weak-title">
          <SectionHeader
            title={<span id="weak-title">آيات تحتاج عناية</span>}
            action={
              data.weak.length ? (
                <ButtonLink href="/review" size="sm" variant="secondary" icon="review">
                  راجِعها
                </ButtonLink>
              ) : undefined
            }
            className="mb-3"
          />
          {data.weak.length ? (
            <ul className="divide-y divide-line">
              {data.weak.slice(0, 6).map((p) => (
                <li key={p.key}>
                  <Link href={`/review?focus=${p.key}`} className="flex items-center gap-3 py-3 rounded-xl hover:bg-parchment/60 -mx-2 px-2">
                    <span className="size-2 rounded-full bg-sand" aria-hidden />
                    <span className="flex-1 text-sm text-ink">
                      سورة {getSurahMeta(p.surah)?.nameAr} · الآية {toArabicDigits(p.ayah)}
                    </span>
                    {latestAccuracy(p) != null ? <span className="text-xs text-muted num">آخر دقة {percent(latestAccuracy(p)!)}</span> : null}
                    <Icon name="forward" size={16} className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm leading-7 text-muted">لا آيات ضعيفة الآن — حفظك متماسك، بارك الله فيك.</p>
          )}
          {data.weak.length > 6 ? <p className="mt-2 text-xs text-muted">و{ayahCount(data.weak.length - 6)} أخرى في قائمة المراجعة.</p> : null}
        </section>

        <section aria-labelledby="strong-title">
          <SectionHeader title={<span id="strong-title">آيات راسخة</span>} eyebrow={ayahCount(data.strong.length)} className="mb-3" />
          {data.strong.length ? (
            <ul className="flex flex-wrap gap-2 pt-1">
              {toRanges(data.strong)
                .slice(0, 12)
                .map((r) => (
                  <li key={`${r.surah}-${r.from}`}>
                    <Badge>
                      <Icon name="check" size={12} />
                      {getSurahMeta(r.surah)?.nameAr} {toArabicDigits(r.from)}
                      {r.to !== r.from ? `–${toArabicDigits(r.to)}` : ""}
                    </Badge>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="py-4 text-sm leading-7 text-muted">تصبح الآية راسخة بعد مراجعات متباعدة ناجحة. استمر وستمتلئ هذه المساحة.</p>
          )}
        </section>
      </div>

      {/* ── Per-surah ────────────────────────────────────────────── */}
      {data.surahs.length ? (
        <section aria-labelledby="surahs-title" className="mt-14">
          <SectionHeader title={<span id="surahs-title">السور</span>} className="mb-3" />
          <ul className="grid gap-x-10 md:grid-cols-2 divide-y divide-line md:divide-y-0">
            {data.surahs.map((s) => (
              <li key={s.meta.number} className="md:border-b md:hairline">
                <Link href={`/quran/${s.meta.number}`} className="block py-4 group">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-xl text-forest group-hover:text-olive">سورة {s.meta.nameAr}</span>
                    <span className="text-xs text-muted num">
                      {n(s.memorized)} / {n(s.total)} محفوظة
                      {s.ratio >= 1 ? " · أتممتها" : ""}
                      {s.weak ? ` · ${needsReviewLabel(s.weak)}` : ""}
                    </span>
                  </span>
                  <ProgressBar
                    value={s.ratio}
                    tone={s.ratio >= 1 ? "forest" : "olive"}
                    label={`سورة ${s.meta.nameAr}: ${percent(s.ratio)} من الحفظ`}
                    className="mt-2.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Recent recitations ───────────────────────────────────── */}
      <section aria-labelledby="recent-title" className="mt-14">
        <SectionHeader
          title={<span id="recent-title">آخر التسميعات</span>}
          action={
            <ButtonLink href="/recite" size="sm" variant="ghost" icon="mic">
              سمّع الآن
            </ButtonLink>
          }
          className="mb-3"
        />
        {data.recitations.length ? (
          <ul className="divide-y divide-line">
            {data.recitations.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                <span className="min-w-0 flex-1 text-sm text-ink">
                  سورة {getSurahMeta(r.surah)?.nameAr} · {toArabicDigits(r.from)}–{toArabicDigits(r.to)}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold num",
                    r.accuracy >= 0.9 ? "text-olive" : r.accuracy >= 0.75 ? "text-forest" : "text-terracotta",
                  )}
                >
                  {percent(r.accuracy)}
                </span>
                <span className="text-xs text-muted w-24">{r.mistakes ? `${n(r.mistakes)} ملاحظات` : "بلا أخطاء"}</span>
                <time dateTime={r.at} className="text-xs text-muted w-20 text-end">
                  {formatDate(r.at)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted">لم تسمّع بعد. التسميع يثبّت الحفظ ويكشف مواضع التردد.</p>
        )}
      </section>
    </Page>
  );
}
