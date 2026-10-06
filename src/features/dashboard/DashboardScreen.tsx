"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Page } from "@/components/layout/PageHeader";
import { CoachCard } from "./CoachCard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, ButtonLink, EmptyState, ProgressBar, ProgressRing, Stat, cn } from "@/components/ui/primitives";
import { ayahsLabel, countLabel, daysLabel, formatPercent, formatTime, rangeLabel } from "@/lib/arabic";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { needsReviewLabel, rangesLabel } from "@/lib/review/labels";
import type { SurahCompletion, SurahOverview } from "@/lib/review/learning";
import { useApp } from "@/lib/store/AppProvider";
import {
  averageAccuracy,
  continuation,
  derivedReminders,
  lastNDays,
  memorizationOverview,
  memorizedCount,
  reviewQueue,
  streakDays,
  surahProgress,
  today,
  todaysWird,
  weakAyahs,
} from "@/lib/store/selectors";
import type { AppNotification, ReviewItem, SurahMeta } from "@/lib/types";

/** Stories (written by the stories screen) that relate to a surah being memorized. */
const RELATED_STORY: Record<number, { slug: string; title: string }> = {
  19: { slug: "maryam", title: "قصة مريم عليها السلام" },
  12: { slug: "yusuf", title: "قصة يوسف عليه السلام" },
  18: { slug: "ashab-al-kahf", title: "قصة أصحاب الكهف" },
};

export function DashboardScreen() {
  const { state } = useApp();

  const data = useMemo(() => {
    // Where to continue is DERIVED from what is memorized — a stale stored pointer cannot mislead.
    const cont = continuation(state);
    const meta = cont.kind === "none" ? undefined : getSurahMeta(cont.surah);
    const resume = meta && cont.kind !== "none" ? { surah: meta.number, ayah: cont.kind === "continue" ? cont.ayah : meta.ayahCount } : null;
    // When the surah is complete, where the learner is really working next (never hides other surahs).
    const next = cont.kind === "complete" ? cont.next : null;
    const target = state.profile?.dailyTargetAyahs ?? state.goals.dailyAyahs;
    const reviews = reviewQueue(state)
      .filter((r) => r.bucket === "today" || r.bucket === "weak")
      .sort((a, b) => b.priority - a.priority);
    return {
      resume,
      next,
      overview: memorizationOverview(state),
      meta,
      target,
      surah: meta ? surahProgress(state, meta.number) : null,
      wird: todaysWird(state),
      todayActivity: today(state),
      reviews,
      week: lastNDays(state, 7),
      streak: streakDays(state),
      accuracy: averageAccuracy(state),
      memorized: memorizedCount(state),
      weak: weakAyahs(state).length,
      reminders: derivedReminders(state),
    };
  }, [state]);

  const firstName = (state.profile?.name ?? "").trim().split(/\s+/)[0];

  return (
    <Page>
      <h1 className="sr-only">الرئيسية</h1>
      <ReminderBanner reminders={data.reminders} />
      <CoachCard />

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <ResumeHero
          className="lg:col-span-8"
          name={firstName}
          meta={data.meta}
          ayah={data.resume?.ayah ?? null}
          surah={data.surah}
          next={data.next}
          target={data.target}
        />
        <WirdPanel
          className="lg:col-span-4"
          wird={data.wird}
          done={data.todayActivity.memorized}
          target={data.target}
          surahDone={!!data.surah && data.surah.ratio >= 1}
          reminderTime={state.notificationPrefs.dailyReminder ? state.notificationPrefs.preferredTime : null}
        />
      </div>

      <StatsRow
        meta={data.meta}
        complete={!!data.surah && data.surah.complete}
        next={data.next}
        ayah={data.resume?.ayah ?? null}
        streak={data.streak}
        accuracy={data.accuracy}
        memorized={data.memorized}
        weak={data.weak}
      />

      <MemorizedOverview rows={data.overview} />

      <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <ReviewToday className="lg:col-span-7" items={data.reviews} />
        <div className="space-y-10 lg:col-span-5">
          <WeekChart days={data.week} />
          <StorySuggestion surah={data.meta?.number} />
        </div>
      </div>
    </Page>
  );
}

// ── All memorized Quran (not just the current surah) ─────────────────────
function MemorizedOverview({ rows }: { rows: SurahOverview[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="mem-title" className="mb-12">
      <h2 id="mem-title" className="font-display text-2xl text-forest mb-3">
        محفوظاتك
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const name = getSurahMeta(r.surah)?.nameAr;
          return (
            <li key={r.surah}>
              <Link href={`/quran/${r.surah}`} className="block rounded-2xl bg-white/70 px-4 py-3.5 ring-1 ring-line transition-colors hover:bg-parchment/60">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-xl text-forest">سورة {name}</span>
                  <span className="text-xs text-muted num">
                    {toArabicDigits(r.memorized)} / {toArabicDigits(r.total)} محفوظة{r.complete ? " · مكتملة" : ""}
                  </span>
                </span>
                <ProgressBar value={r.ratio} tone={r.complete ? "forest" : "olive"} label={`سورة ${name}: ${formatPercent(r.ratio)} من الحفظ`} className="mt-2.5" />
                <span className="mt-2 block text-xs leading-6 text-muted">
                  {r.ranges.length ? rangesLabel(r.ranges) : "لم تُحفظ آية بعد"}
                  {r.weak ? ` · ${needsReviewLabel(r.weak)}` : ""}
                  {r.learning ? ` · ${toArabicDigits(r.learning)} قيد التعلّم` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Reminder banner ──────────────────────────────────────────────────────
function ReminderBanner({ reminders }: { reminders: AppNotification[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  // The wird reminder is redundant here — today's wird sits right below.
  const r = ["welcome-back", "review-due"]
    .map((k) => reminders.find((n) => n.kind === k))
    .find((n): n is AppNotification => !!n && !dismissed.includes(n.id));
  if (!r) return null;

  return (
    <div role="status" className="mb-6 flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 ring-1 ring-sand/30 animate-rise">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sand-100 text-terracotta">
        <Icon name={r.kind === "welcome-back" ? "leaf" : "review"} size={18} />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-6">
        <span className="font-semibold text-forest">{r.title}</span>
        <span className="text-ink/70"> — {r.body}</span>
      </p>
      {r.href ? (
        <Link href={r.href} className="hidden shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-forest hover:bg-sand-100 sm:inline-flex">
          {r.kind === "welcome-back" ? "أكمل من هناك" : "راجع الآن"}
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => setDismissed((d) => [...d, r.id])}
        aria-label="إخفاء التذكير"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-sand-100 hover:text-forest"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

// ── Hero: where did I stop? ──────────────────────────────────────────────
function ResumeHero({
  className,
  name,
  meta,
  ayah,
  surah,
  next,
  target,
}: {
  className?: string;
  name: string;
  meta?: SurahMeta;
  ayah: number | null;
  surah: SurahCompletion | null;
  /** when this surah is complete: where the learner is working next */
  next?: { surah: number; ayah: number } | null;
  target: number;
}) {
  const done = !!surah && surah.ratio >= 1;
  // the last stretch memorized before the resume point — what "سمّع ما حفظت" opens
  const reciteTo = ayah && ayah > 1 ? ayah - 1 : null;
  const reciteFrom = reciteTo ? Math.max(1, reciteTo - Math.max(target, 3) + 1) : null;

  return (
    <section aria-labelledby="hero-title" className={cn("relative overflow-hidden rounded-[1.75rem] bg-forest text-cream", className)}>
      <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.1] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative p-6 sm:p-8">
        <p className="text-cream/75">السلام عليكم{name ? `، ${name}` : ""} 🌿</p>
        <h2 id="hero-title" className="mt-1 font-display text-2xl leading-snug sm:text-[1.7rem]">
          واصل رحلتك مع كتاب الله
        </h2>

        <div className="mt-6 border-t border-cream/10 pt-6">
          {meta && ayah ? (
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm text-cream/60">{done ? "أتممت بفضل الله" : "توقفت عند"}</p>
                <p className="mt-1 font-display text-4xl leading-tight sm:text-5xl">سورة {meta.nameAr}</p>
                <p className="mt-2 text-cream/80 num">
                  {done ? `${ayahsLabel(meta.ayahCount)} محفوظة` : `الآية ${toArabicDigits(ayah)} من ${toArabicDigits(meta.ayahCount)}`}
                </p>
                {/* review state is separate from completion: a fully memorized surah can have ayahs to review */}
                {surah && surah.weak > 0 ? <p className="mt-1 text-sm text-sand">{needsReviewLabel(surah.weak)}</p> : null}
              </div>
              {surah ? (
                <ProgressRing
                  value={surah.ratio}
                  size={104}
                  stroke={7}
                  tone="sand"
                  label={`حُفظ ${toArabicDigits(surah.memorized)} من ${toArabicDigits(surah.total)} آية في سورة ${meta.nameAr}`}
                >
                  <span>
                    <span className="block text-lg font-semibold num">{formatPercent(surah.ratio)}</span>
                    <span className="block text-[0.68rem] text-cream/60">من الحفظ</span>
                  </span>
                </ProgressRing>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="font-display text-3xl">من أين نبدأ؟</p>
              <p className="mt-2 max-w-md text-sm leading-7 text-cream/70">اختر سورة من المصحف، وسيحفظ مُدّكِر موضعك فيها بالآية.</p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-2.5">
            {meta && ayah && !done ? (
              <ButtonLink href={`/memorize/${meta.number}?from=${ayah}`} variant="secondary" size="lg" icon="play">
                متابعة الحفظ
              </ButtonLink>
            ) : done && next ? (
              <ButtonLink href={`/memorize/${next.surah}?from=${next.ayah}`} variant="secondary" size="lg" icon="play">
                تابع: سورة {getSurahMeta(next.surah)?.nameAr} — الآية {toArabicDigits(next.ayah)}
              </ButtonLink>
            ) : (
              <ButtonLink href="/quran" variant="secondary" size="lg" icon="mushaf">
                {done ? "اختر سورتك القادمة" : "افتح المصحف"}
              </ButtonLink>
            )}
            {meta && reciteFrom && reciteTo ? (
              <Link
                href={`/recite?surah=${meta.number}&from=${done ? 1 : reciteFrom}&to=${done ? meta.ayahCount : reciteTo}`}
                className="inline-flex h-13 items-center gap-2.5 rounded-2xl px-6 text-cream ring-1 ring-inset ring-cream/25 transition-colors hover:bg-cream/10"
              >
                <Icon name="mic" size={18} />
                سمّع ما حفظت
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Today's wird: what should I memorize today? ──────────────────────────
function WirdPanel({
  className,
  wird,
  done,
  target,
  surahDone,
  reminderTime,
}: {
  className?: string;
  wird: { surah: number; from: number; to: number } | null;
  done: number;
  target: number;
  surahDone: boolean;
  reminderTime: string | null;
}) {
  const meta = wird ? getSurahMeta(wird.surah) : undefined;
  const complete = done >= target;
  const shown = Math.min(done, target);

  return (
    <section aria-labelledby="wird-title" className={cn("flex flex-col rounded-[1.75rem] bg-parchment p-6 sm:p-7", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="wird-title" className="text-lg font-semibold text-forest">
          ورد اليوم
        </h2>
        {reminderTime ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Icon name="bell" size={14} />
            <span className="num">{formatTime(reminderTime)}</span>
          </span>
        ) : null}
      </div>

      {complete ? (
        <div className="mt-5 flex-1 animate-rise">
          <span className="grid size-12 place-items-center rounded-full bg-olive-100 text-olive">
            <Icon name="checkCircle" size={26} />
          </span>
          <p className="mt-4 font-display text-2xl text-forest">أتممت ورد اليوم</p>
          <p className="mt-1.5 text-sm leading-7 text-muted">
            بارك الله في وقتك. حفظت اليوم {ayahsLabel(done)}، وستنضم إلى مراجعتك في موعدها.
          </p>
          {meta && wird && !surahDone ? (
            <Link
              href={`/memorize/${meta.number}?from=${wird.from}`}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-olive-600 hover:text-forest"
            >
              زيادة خير؟ تابع من الآية {toArabicDigits(wird.from)}
              <Icon name="forward" size={16} />
            </Link>
          ) : null}
        </div>
      ) : meta && wird && !surahDone ? (
        <div className="mt-5 flex flex-1 flex-col">
          <p className="font-display text-3xl text-forest">سورة {meta.nameAr}</p>
          <p className="mt-1 text-ink/75 num">{rangeLabel(wird.from, wird.to)}</p>

          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-muted">ما حفظته اليوم</span>
              <span className="font-medium text-forest num">
                {toArabicDigits(shown)} / {toArabicDigits(target)}
              </span>
            </div>
            <ProgressBar value={shown / target} label={`حفظت ${toArabicDigits(shown)} من ${toArabicDigits(target)} آيات اليوم`} />
          </div>

          <div className="mt-auto pt-6">
            <ButtonLink href={`/memorize/${meta.number}?from=${wird.from}`} className="w-full" iconEnd="forward">
              {shown > 0 ? "أكمل الورد" : "ابدأ ورد اليوم"}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex-1">
          <p className="text-sm leading-7 text-muted">
            {surahDone ? "أتممت سورتك الحالية. اختر سورة جديدة ليبدأ وردك القادم منها." : "اختر سورة لتبدأ وردك اليومي."}
          </p>
          <ButtonLink href="/quran" variant="ghost" className="mt-5" icon="mushaf">
            اختر سورة
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

// ── Compact stats: how am I progressing? ─────────────────────────────────
function StatsRow({
  meta,
  complete,
  next,
  ayah,
  streak,
  accuracy,
  memorized,
  weak,
}: {
  meta?: SurahMeta;
  ayah: number | null;
  streak: number;
  accuracy: number | null;
  memorized: number;
  weak: number;
  complete: boolean;
  next?: { surah: number; ayah: number } | null;
}) {
  const items: { label: string; value: string; hint?: string; icon: IconName; wide?: boolean }[] = [
    {
      label: "موضع المتابعة",
      value:
        meta && ayah
          ? complete
            ? next
              ? `${getSurahMeta(next.surah)?.nameAr} · ${toArabicDigits(next.ayah)}`
              : `${meta.nameAr} · مكتملة`
            : `${meta.nameAr} · ${toArabicDigits(ayah)}`
          : "—",
      hint: meta && ayah ? (complete ? (next ? `بعد إتمام سورة ${meta.nameAr}` : "أتممت حفظها — راجعها") : "السورة · الآية") : undefined,
      icon: "bookmark",
      wide: true,
    },
    { label: "أيام الالتزام", value: toArabicDigits(streak), hint: streak ? "متتالية" : "يبدأ العدّ اليوم", icon: "flame" },
    { label: "دقة التسميع", value: accuracy != null ? formatPercent(accuracy) : "—", hint: accuracy != null ? "متوسط آخر تسميع لكل آية" : "بعد أول تسميع", icon: "target" },
    { label: "الآيات المحفوظة", value: toArabicDigits(memorized), icon: "mushaf" },
    { label: "تحتاج مراجعة", value: toArabicDigits(weak), hint: weak ? "نثبّتها معًا" : "كل شيء ثابت", icon: "review" },
  ];

  return (
    <section aria-labelledby="stats-title" className="my-10 lg:my-12">
      <h2 id="stats-title" className="sr-only">
        ملخص تقدّمك
      </h2>
      <ul className="grid grid-cols-2 border-y hairline sm:grid-cols-3 lg:grid-cols-5">
        {items.map((s, i) => (
          <li
            key={s.label}
            className={cn(
              "hairline py-5 pe-4",
              s.wide && "col-span-2 border-b hairline sm:col-span-1 sm:border-b-0",
              i > 0 && "lg:border-s lg:ps-6",
              i === 0 && "lg:pe-6",
            )}
          >
            <Stat label={s.label} value={s.value} hint={s.hint} icon={s.icon} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Today's review: what should I review? ────────────────────────────────
function ReviewToday({ className, items }: { className?: string; items: ReviewItem[] }) {
  const top = items.slice(0, 3);
  return (
    <section aria-labelledby="review-title" className={className}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="review-title" className="text-lg font-semibold text-forest">
            مراجعة اليوم
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {items.length
              ? `${countLabel(items.length, { one: "مقطع واحد", two: "مقطعان", few: "مقاطع", many: "مقطعًا" })} في موعدها اليوم`
              : "مراجعة متباعدة في وقتها"}
          </p>
        </div>
        {items.length ? (
          <Link href="/review" className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-olive-600 hover:text-forest">
            كل المراجعات
            <Icon name="forward" size={16} />
          </Link>
        ) : null}
      </div>

      {top.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title="لا مراجعات اليوم — أحسنت"
          body="ما حفظته في أمان. سنذكّرك حين يحين موعد المراجعة القادمة."
          className="mt-4 rounded-[var(--radius-card)] bg-parchment/60 py-10"
        />
      ) : (
        <ul className="mt-4 divide-y divide-line border-y hairline">
          {top.map((r) => {
            const m = getSurahMeta(r.surah);
            const weak = r.bucket === "weak";
            return (
              <li key={`${r.surah}:${r.from}-${r.to}`}>
                <Link
                  href={`/recite?surah=${r.surah}&from=${r.from}&to=${r.to}&mode=review`}
                  className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-4 transition-colors hover:bg-parchment/60"
                >
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-2xl",
                      weak ? "bg-sand-100 text-terracotta" : "bg-olive-100 text-olive",
                    )}
                  >
                    <Icon name={weak ? "alert" : "review"} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-xl text-forest">سورة {m?.nameAr}</span>
                      <Badge tone={weak ? "sand" : "olive"}>{weak ? "تحتاج تثبيتًا" : "موعدها اليوم"}</Badge>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted num">
                      {rangeLabel(r.from, r.to)}
                      {r.avgAccuracy != null ? ` · آخر دقة ${formatPercent(r.avgAccuracy)}` : ""}
                    </span>
                  </span>
                  <span className="hidden items-center gap-1.5 text-sm font-medium text-forest sm:inline-flex">
                    <Icon name="mic" size={16} />
                    سمّع
                  </span>
                  <Icon name="forward" size={18} className="text-muted transition-transform group-hover:text-forest" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Weekly rhythm ────────────────────────────────────────────────────────
type Day = ReturnType<typeof lastNDays>[number];

function WeekChart({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.memorized + d.reviewed));
  const active = days.filter((d) => d.memorized + d.reviewed + d.recitations > 0).length;
  const encouragement =
    active >= 5 ? "إيقاع ثابت، بارك الله فيك." : active >= 3 ? "خطوات طيبة، يومًا بعد يوم." : "كل يوم بداية جديدة — ولو بآية.";

  return (
    <section aria-labelledby="week-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="week-title" className="text-lg font-semibold text-forest">
            أسبوعك
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            حاضر في {daysLabel(active)} من ٧ · {encouragement}
          </p>
        </div>
      </div>

      <ul aria-label="نشاط آخر سبعة أيام" className="mt-6 grid h-40 grid-cols-7 items-end gap-2 sm:gap-3">
        {days.map((d) => {
          const total = d.memorized + d.reviewed;
          const h = total ? Math.max(8, (total / max) * 100) : 0;
          const memShare = total ? (d.memorized / total) * 100 : 0;
          return (
            <li key={d.date} className="flex h-full flex-col items-center justify-end gap-2">
              <span className="sr-only">
                {d.isToday ? "اليوم" : d.weekday}: {total ? `حفظ ${toArabicDigits(d.memorized)} ومراجعة ${toArabicDigits(d.reviewed)}` : "لا نشاط"}
              </span>
              <div
                aria-hidden
                className={cn(
                  "flex w-full max-w-9 flex-1 items-end rounded-xl p-0.5",
                  d.isToday && "ring-1 ring-inset ring-forest/40",
                )}
              >
                {total ? (
                  <div className="flex w-full flex-col overflow-hidden rounded-[0.6rem]" style={{ height: `${h}%` }}>
                    <div className="w-full flex-1 bg-olive-100" />
                    <div className="w-full bg-olive" style={{ height: `${memShare}%` }} />
                  </div>
                ) : (
                  <div className="h-1 w-full rounded-full bg-line" />
                )}
              </div>
              <span aria-hidden className={cn("text-[0.7rem]", d.isToday ? "font-semibold text-forest" : "text-muted")}>
                {d.isToday ? "اليوم" : d.weekday}
              </span>
            </li>
          );
        })}
      </ul>

      <div aria-hidden className="mt-4 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-olive" />
          حفظ
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-olive-100 ring-1 ring-inset ring-sage" />
          مراجعة
        </span>
      </div>
    </section>
  );
}

// ── Related story ────────────────────────────────────────────────────────
function StorySuggestion({ surah }: { surah?: number }) {
  const story = surah ? RELATED_STORY[surah] : undefined;
  const href = story ? `/stories/${story.slug}` : "/stories";
  return (
    <section aria-labelledby="story-title" className="border-t hairline pt-6">
      <Link href={href} className="group -mx-2 flex items-start gap-4 rounded-2xl px-2 py-2 transition-colors hover:bg-parchment/60">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sand-100 text-terracotta">
          <Icon name="scroll" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-olive">{story ? "قصة مرتبطة" : "قصص القرآن"}</span>
          <span id="story-title" className="mt-0.5 block font-display text-xl text-forest">
            {story ? story.title : "تأمّل قصص القرآن"}
          </span>
          <span className="mt-1 block text-sm leading-6 text-muted">
            {story ? "تأمّل القصة التي تحفظ آياتها الآن، فيثبت المعنى مع اللفظ." : "يوسف ومريم وأصحاب الكهف وغيرها، مرتبطة بمواضعها من السور."}
          </span>
        </span>
        <Icon name="forward" size={18} className="mt-3 text-muted group-hover:text-forest" />
      </Link>
    </section>
  );
}
