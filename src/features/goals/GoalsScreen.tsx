"use client";

import { useId, useMemo } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Button, ButtonLink, cn, inputClass, ProgressRing } from "@/components/ui/primitives";
import { ayahCount, dayCount, formatDate, n } from "@/features/shared/format";
import { getSurahMeta, SURAHS, toArabicDigits } from "@/lib/quran/surahs";
import { useApp } from "@/lib/store/AppProvider";
import { lastNDays, surahProgress, today } from "@/lib/store/selectors";
import { todayKey } from "@/lib/store/state";
import { Stepper } from "./Stepper";

const DAY = 86_400_000;
const MAX_DAILY = 40;

function parseLocalDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Pure projection: when will the milestone be reached at the current pace? */
export function projectMilestone(opts: { remaining: number; dailyAyahs: number; weeklyDays: number; targetDate?: string }) {
  const { remaining, dailyAyahs, weeklyDays, targetDate } = opts;
  const studyDays = Math.ceil(remaining / Math.max(1, dailyAyahs));
  const calendarDays = Math.ceil((studyDays * 7) / Math.max(1, weeklyDays));
  const start = startOfToday();
  const projected = new Date(start.getTime() + calendarDays * DAY);
  let target: null | { daysLeft: number; onTrack: boolean; neededDaily: number } = null;
  if (targetDate) {
    const daysLeft = Math.round((parseLocalDate(targetDate).getTime() - start.getTime()) / DAY);
    const available = Math.max(1, Math.floor((Math.max(daysLeft, 0) * weeklyDays) / 7));
    target = { daysLeft, onTrack: daysLeft > 0 && calendarDays <= daysLeft, neededDaily: Math.ceil(remaining / available) };
  }
  return { studyDays, calendarDays, projected, target };
}

export function GoalsScreen() {
  const { state, actions } = useApp();
  const ids = { surah: useId(), date: useId() };
  const { goals } = state;
  const daily = state.profile?.dailyTargetAyahs ?? goals.dailyAyahs;
  const todayDone = today(state).memorized;
  const week = lastNDays(state, 7);
  const activeDays = week.filter((d) => d.memorized + d.reviewed + d.recitations > 0).length;

  const milestone = goals.targetSurah ? getSurahMeta(goals.targetSurah) : undefined;
  const prog = milestone ? surahProgress(state, milestone.number) : null;
  const remaining = prog ? Math.max(0, prog.total - prog.memorized) : 0;
  const projection = useMemo(
    () =>
      milestone && remaining > 0
        ? projectMilestone({ remaining, dailyAyahs: daily, weeklyDays: goals.weeklyDays, targetDate: goals.targetDate })
        : null,
    [milestone, remaining, daily, goals.weeklyDays, goals.targetDate],
  );

  function setDaily(v: number) {
    actions.updateGoals({ dailyAyahs: v });
    actions.updateProfile({ dailyTargetAyahs: v });
  }

  const dailyDone = todayDone >= daily;

  return (
    <Page narrow>
      <PageHeader eyebrow="رحلتك" title="أهدافك" description="هدف صغير تداوم عليه أحبّ من هدف كبير ينقطع. اضبط إيقاعك بما يناسب يومك." />

      {/* ── Today ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="today-goal"
        className={cn(
          "flex items-center gap-5 rounded-[var(--radius-card)] px-5 py-5 sm:px-6",
          dailyDone ? "bg-forest text-cream" : "bg-parchment/70",
        )}
      >
        <ProgressRing value={todayDone / Math.max(1, daily)} label="ورد اليوم" size={68} tone={dailyDone ? "cream" : "olive"}>
          {dailyDone ? <Icon name="check" size={24} className="text-cream" /> : <span className="text-sm font-semibold text-forest num">{n(todayDone)}/{n(daily)}</span>}
        </ProgressRing>
        <div className="min-w-0">
          <h2 id="today-goal" className={cn("font-display text-2xl", dailyDone ? "text-cream" : "text-forest")}>
            {dailyDone ? "أتممت ورد اليوم" : "ورد اليوم"}
          </h2>
          <p className={cn("text-sm leading-7", dailyDone ? "text-cream/80" : "text-muted")}>
            {dailyDone
              ? "تقبّل الله منك. ما تبقّى من يومك للمراجعة والتدبّر."
              : todayDone
                ? `بقي ${ayahCount(daily - todayDone)} لتُتم وردك.`
                : `هدفك اليوم ${ayahCount(daily)}.`}
          </p>
        </div>
        {!dailyDone && state.resume ? (
          <ButtonLink href={`/memorize/${state.resume.surah}?from=${state.resume.ayah}`} size="sm" className="ms-auto hidden sm:inline-flex" iconEnd="forward">
            تابع الحفظ
          </ButtonLink>
        ) : null}
      </section>

      {/* ── Rhythm ────────────────────────────────────────────────── */}
      <section aria-labelledby="rhythm" className="mt-12">
        <h2 id="rhythm" className="text-lg font-semibold text-forest mb-6">
          إيقاعك
        </h2>
        <div className="grid gap-10 sm:grid-cols-2">
          <Stepper
            label="آيات جديدة كل يوم"
            hint="يُحدَّد بها ورد الحفظ اليومي"
            value={daily}
            min={1}
            max={MAX_DAILY}
            onChange={setDaily}
            unit={(v) => ayahCount(v)}
          />
          <div>
            <Stepper
              label="أيام الحفظ في الأسبوع"
              hint="الأيام الباقية للمراجعة والراحة"
              value={goals.weeklyDays}
              min={1}
              max={7}
              onChange={(v) => actions.updateGoals({ weeklyDays: v })}
              unit={(v) => dayCount(v)}
            />
            <div className="mt-4 flex items-center gap-1.5" aria-label={`نشطت هذا الأسبوع ${dayCount(activeDays)} من ${dayCount(goals.weeklyDays)}`} role="img">
              {week.map((d) => {
                const active = d.memorized + d.reviewed + d.recitations > 0;
                return (
                  <span
                    key={d.date}
                    title={d.weekday}
                    className={cn(
                      "h-2 flex-1 max-w-8 rounded-full",
                      active ? "bg-olive" : "bg-olive-100",
                      d.isToday && "ring-2 ring-forest/30 ring-offset-1 ring-offset-paper",
                    )}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              هذا الأسبوع: {toArabicDigits(activeDays)} من {toArabicDigits(goals.weeklyDays)}
              {activeDays >= goals.weeklyDays ? " — أتممت هدف الأسبوع 🌿" : ""}
            </p>
          </div>
        </div>
      </section>

      {/* ── Milestone ─────────────────────────────────────────────── */}
      <section aria-labelledby="milestone" className="mt-14 border-t hairline pt-10">
        <h2 id="milestone" className="text-lg font-semibold text-forest">
          محطتك القادمة
        </h2>
        <p className="text-sm text-muted mt-1 mb-6">اختر سورة تريد إتمامها، وموعدًا إن أحببت، وسنقدّر لك متى تصل.</p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.surah} className="block text-sm font-medium text-forest">
              السورة
            </label>
            <select
              id={ids.surah}
              value={goals.targetSurah ?? ""}
              onChange={(e) => actions.updateGoals({ targetSurah: e.target.value ? Number(e.target.value) : undefined })}
              className={inputClass}
            >
              <option value="">بدون محطة</option>
              {SURAHS.map((s) => (
                <option key={s.number} value={s.number}>
                  {toArabicDigits(s.number)}. سورة {s.nameAr} ({toArabicDigits(s.ayahCount)} آية)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.date} className="block text-sm font-medium text-forest">
              الموعد المرجو <span className="font-normal text-muted">(اختياري)</span>
            </label>
            <div className="flex gap-2">
              <input
                id={ids.date}
                type="date"
                min={todayKey()}
                value={goals.targetDate ?? ""}
                onChange={(e) => actions.updateGoals({ targetDate: e.target.value || undefined })}
                className={inputClass}
              />
              {goals.targetDate ? (
                <Button variant="quiet" onClick={() => actions.updateGoals({ targetDate: undefined })} aria-label="إزالة الموعد">
                  <Icon name="x" size={18} />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {milestone && prog ? (
          <div aria-live="polite" className="mt-8">
            {remaining === 0 ? (
              <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-forest text-cream px-6 py-7">
                <span className="pattern-girih absolute inset-0 opacity-[0.1]" aria-hidden />
                <div className="relative flex items-start gap-4">
                  <span className="grid place-items-center size-12 shrink-0 rounded-full bg-cream/10 text-sand">
                    <Icon name="checkCircle" size={24} />
                  </span>
                  <div>
                    <p className="font-display text-2xl">أتممت سورة {milestone.nameAr}</p>
                    <p className="mt-1 text-sm leading-7 text-cream/80">
                      ثبّتها الله في قلبك. ستبقى في مراجعاتك المتباعدة — اختر محطتك التالية متى شئت.
                    </p>
                  </div>
                </div>
              </div>
            ) : projection ? (
              <div className="rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line px-6 py-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-muted">
                    سورة {milestone.nameAr}: حفظت {n(prog.memorized)} من {n(prog.total)}، وبقي {ayahCount(remaining)}
                  </p>
                </div>
                <p className="mt-4 text-sm text-muted">بإيقاعك الحالي تصل بإذن الله نحو</p>
                <p className="font-display text-3xl text-forest mt-1">
                  {formatDate(projection.projected, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <p className="mt-1 text-xs text-muted">
                  بعد {dayCount(projection.calendarDays)} تقريبًا ({dayCount(projection.studyDays)} حفظ بمعدل {ayahCount(daily)})
                </p>

                {projection.target ? (
                  <div className="mt-5 border-t hairline pt-4">
                    {projection.target.daysLeft <= 0 ? (
                      <p className="text-sm text-terracotta">مضى الموعد الذي اخترته. اختر موعدًا جديدًا بلطف مع نفسك.</p>
                    ) : projection.target.onTrack ? (
                      <p className="flex items-center gap-2 text-sm text-olive">
                        <Icon name="checkCircle" size={18} />
                        أنت على المسار للوصول قبل {formatDate(goals.targetDate!)}.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm leading-7 text-ink/80">
                          لتصل قبل {formatDate(goals.targetDate!)} تحتاج نحو{" "}
                          <span className="font-semibold text-forest">{ayahCount(projection.target.neededDaily)}</span> يوميًا.
                        </p>
                        {projection.target.neededDaily <= MAX_DAILY ? (
                          <Button size="sm" variant="secondary" onClick={() => setDaily(projection.target!.neededDaily)}>
                            اعتمد هذا الورد
                          </Button>
                        ) : (
                          <p className="text-xs text-muted">الموعد قريب جدًا؛ قد يكون موعد أبعد أرفق بك.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </Page>
  );
}
