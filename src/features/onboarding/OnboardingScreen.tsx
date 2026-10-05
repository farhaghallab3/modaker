"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, Spinner, cn, inputClass } from "@/components/ui/primitives";
import { ayahsLabel, daysLabel, formatTime, rangeLabel, sessionsLabel } from "@/lib/arabic";
import { SURAHS, getSurahMeta, revelationLabel, toArabicDigits } from "@/lib/quran/surahs";
import { useApp } from "@/lib/store/AppProvider";
import type { ExperienceLevel, MemorizedAmount } from "@/lib/types";

// ── Options ──────────────────────────────────────────────────────────────
const AMOUNTS: { value: MemorizedAmount; label: string; description: string }[] = [
  { value: "none", label: "لم أبدأ بعد", description: "سنبدأ معًا من أول خطوة." },
  { value: "juz-amma", label: "جزء عمّ", description: "أساس جميل نبني عليه." },
  { value: "few-juz", label: "بضعة أجزاء", description: "تقدّم يستحق التثبيت." },
  { value: "half", label: "نصف القرآن", description: "قطعت شوطًا كبيرًا." },
  { value: "most", label: "أكثر القرآن", description: "قريب من الختم بإذن الله." },
  { value: "all", label: "القرآن كاملًا", description: "نركّز معك على التثبيت والمراجعة." },
];

const QUICK_SURAHS = [19, 12, 18, 67];

const TARGETS = [3, 5, 7, 10, 15];

const REMINDER_SUGGESTIONS: { time: string; label: string }[] = [
  { time: "05:30", label: "بعد الفجر" },
  { time: "09:00", label: "الضحى" },
  { time: "16:30", label: "بعد العصر" },
  { time: "22:00", label: "قبل النوم" },
];

const SESSIONS: { value: number; label: string; description: string }[] = [
  { value: 1, label: "مرة واحدة", description: "مناسبة للأيام المزدحمة." },
  { value: 2, label: "مرتان", description: "صباحًا ومساءً — الإيقاع الذي ننصح به." },
  { value: 3, label: "ثلاث مرات", description: "تثبيت مكثّف لمن يتسع وقته." },
];

const LEVELS: { value: ExperienceLevel; label: string; description: string }[] = [
  { value: "beginner", label: "مبتدئ", description: "بدأت الحفظ حديثًا، وأحتاج خطوات أصغر وتكرارًا أكثر." },
  { value: "intermediate", label: "متوسط", description: "أحفظ بانتظام، وأريد خطة ومراجعة منظّمة." },
  { value: "advanced", label: "متقدم", description: "أحفظ كثيرًا، وأركّز على التثبيت والإتقان." },
];

const STEP_COUNT = 8; // the summary is shown after the eighth question

interface Draft {
  name: string;
  amount: MemorizedAmount | null;
  surah: number | null;
  stoppedAt: number;
  target: number;
  customTarget: boolean;
  reminderTime: string;
  sessions: number;
  level: ExperienceLevel | null;
}

// ── Screen ───────────────────────────────────────────────────────────────
export function OnboardingScreen() {
  const { state, ready, actions } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    amount: null,
    surah: null,
    stoppedAt: 1,
    target: 5,
    customTarget: false,
    reminderTime: "05:30",
    sessions: 2,
    level: null,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Guard: signed out → login; already onboarded → dashboard.
  useEffect(() => {
    if (!ready) return;
    if (!state.session) router.replace("/login?next=/onboarding");
    else if (state.profile?.onboarded) router.replace("/dashboard");
  }, [ready, state.session, state.profile?.onboarded, router]);

  // Prefill the name given at registration.
  const profileName = state.profile?.name;
  useEffect(() => {
    if (profileName) setDraft((d) => (d.name ? d : { ...d, name: profileName }));
  }, [profileName]);

  // Move focus to the new question so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const update = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const meta = draft.surah ? getSurahMeta(draft.surah) : undefined;

  const canContinue = (() => {
    switch (step) {
      case 1:
        return !!draft.amount;
      case 2:
        return !!draft.surah;
      case 4:
        return Number.isInteger(draft.target) && draft.target >= 1 && draft.target <= 50;
      case 5:
        return /^\d{2}:\d{2}$/.test(draft.reminderTime);
      case 7:
        return !!draft.level;
      default:
        return true;
    }
  })();

  function next(e?: FormEvent) {
    e?.preventDefault();
    if (!canContinue) return;
    setStep((s) => Math.min(STEP_COUNT, s + 1));
  }
  const back = () => setStep((s) => Math.max(0, s - 1));

  function finish() {
    if (!draft.surah || !draft.amount || !draft.level) return;
    setFinishing(true);
    actions.completeOnboarding({
      name: draft.name.trim() || undefined,
      memorizedAmount: draft.amount,
      currentSurah: draft.surah,
      stoppedAt: draft.stoppedAt,
      dailyTargetAyahs: draft.target,
      reminderTime: draft.reminderTime,
      reviewSessionsPerDay: draft.sessions,
      level: draft.level,
    });
    router.push("/dashboard");
  }

  if (!ready || !state.session || (state.profile?.onboarded && !finishing)) {
    return (
      <div className="grid min-h-dvh place-items-center text-olive">
        <Spinner className="size-6" />
      </div>
    );
  }

  const isSummary = step === STEP_COUNT;

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-6 px-5 pb-2 pt-6 sm:px-8">
        <Link href="/" aria-label="مُدّكِر — الصفحة الرئيسية" className="rounded-xl">
          <Logo compact />
        </Link>
        {!isSummary ? <StepMeter step={step} /> : null}
      </header>

      <main id="main" className="flex-1">
        <form onSubmit={isSummary ? (e) => (e.preventDefault(), finish()) : next} noValidate className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-14">
            <section key={step} aria-labelledby="step-title" className="animate-rise">
              {step === 0 ? (
                <StepIntro
                  headingRef={headingRef}
                  eyebrow="أهلًا بك في مُدّكِر 🌿"
                  title="لنرتّب خطتك معًا"
                  description="ثمانية أسئلة قصيرة، ثم خطة على قدر وقتك. يمكنك تعديل كل شيء لاحقًا."
                >
                  <label htmlFor="ob-name" className="mb-2 block text-sm font-medium text-forest">
                    بمَ نناديك؟
                  </label>
                  <input
                    id="ob-name"
                    autoFocus
                    autoComplete="given-name"
                    className={cn(inputClass, "h-14 text-lg")}
                    placeholder="اسمك (اختياري)"
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </StepIntro>
              ) : null}

              {step === 1 ? (
                <StepIntro headingRef={headingRef} title="كم تحفظ من القرآن حتى الآن؟" description="لا توجد إجابة صحيحة أو خاطئة — نريد فقط أن نبدأ من حيث أنت.">
                  <RadioCards
                    name="amount"
                    label="مقدار المحفوظ"
                    options={AMOUNTS}
                    value={draft.amount}
                    onChange={(amount) => update({ amount })}
                    columns={2}
                  />
                </StepIntro>
              ) : null}

              {step === 2 ? (
                <StepIntro
                  headingRef={headingRef}
                  title={draft.amount === "all" ? "أي سورة تثبّتها الآن؟" : "ما السورة التي تحفظها الآن؟"}
                  description="اختر السورة التي ستكمل فيها، وسنحفظ موضعك فيها بالآية."
                >
                  <SurahPicker
                    value={draft.surah}
                    onChange={(surah) => {
                      const m = getSurahMeta(surah);
                      update({ surah, stoppedAt: Math.min(draft.surah === surah ? draft.stoppedAt : 1, m?.ayahCount ?? 1) });
                    }}
                  />
                </StepIntro>
              ) : null}

              {step === 3 && meta ? (
                <StepIntro
                  headingRef={headingRef}
                  title="عند أي آية توقفت؟"
                  description={`في سورة ${meta.nameAr} ${ayahsLabel(meta.ayahCount)}. اختر الآية التي ستبدأ منها وردك القادم.`}
                >
                  <AyahStepper value={draft.stoppedAt} max={meta.ayahCount} onChange={(stoppedAt) => update({ stoppedAt })} />
                </StepIntro>
              ) : null}

              {step === 4 ? (
                <StepIntro headingRef={headingRef} title="كم آية تحب أن تحفظ يوميًا؟" description="ابدأ بما تستطيع المداومة عليه؛ القليل الدائم يثبت أكثر.">
                  <DailyTarget draft={draft} update={update} />
                </StepIntro>
              ) : null}

              {step === 5 ? (
                <StepIntro headingRef={headingRef} title="متى نذكّرك بوردك؟" description="اختر وقتًا يكون فيه قلبك حاضرًا وبالك هادئًا.">
                  <ReminderPicker value={draft.reminderTime} onChange={(reminderTime) => update({ reminderTime })} />
                </StepIntro>
              ) : null}

              {step === 6 ? (
                <StepIntro headingRef={headingRef} title="كم مرة تراجع في اليوم؟" description="المراجعة المتباعدة تعيد إليك كل مقطع قبل أن يُنسى.">
                  <RadioCards
                    name="sessions"
                    label="جلسات المراجعة اليومية"
                    options={SESSIONS}
                    value={draft.sessions}
                    onChange={(sessions) => update({ sessions })}
                    columns={3}
                  />
                </StepIntro>
              ) : null}

              {step === 7 ? (
                <StepIntro headingRef={headingRef} title="كيف تصف تجربتك في الحفظ؟" description="نضبط على أساسها طول المقاطع وعدد مرات التكرار.">
                  <RadioCards
                    name="level"
                    label="مستوى الخبرة"
                    options={LEVELS}
                    value={draft.level}
                    onChange={(level) => update({ level })}
                  />
                </StepIntro>
              ) : null}

              {isSummary && meta ? <PlanSummary draft={draft} headingRef={headingRef} /> : null}
            </section>
          </div>

          <div className="sticky bottom-0 border-t hairline bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
              {step > 0 ? (
                <Button type="button" variant="quiet" icon="back" onClick={back} disabled={finishing}>
                  {isSummary ? "تعديل" : "السابق"}
                </Button>
              ) : (
                <span />
              )}
              {isSummary ? (
                <Button type="submit" size="lg" iconEnd="arrowForward" loading={finishing}>
                  ابدأ الآن
                </Button>
              ) : (
                <Button type="submit" size="lg" iconEnd="forward" disabled={!canContinue}>
                  {step === STEP_COUNT - 1 ? "اعرض خطتي" : "التالي"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────
function StepMeter({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-muted num" aria-live="polite">
        السؤال {toArabicDigits(step + 1)} من {toArabicDigits(STEP_COUNT)}
      </p>
      <div aria-hidden className="hidden gap-1 sm:flex">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 w-5 rounded-full transition-colors duration-300", i < step ? "bg-olive" : i === step ? "bg-forest dark:bg-sand" : "bg-sage")}
          />
        ))}
      </div>
      <div aria-hidden className="h-1 w-20 overflow-hidden rounded-full bg-sage sm:hidden">
        <div className="h-full rounded-full bg-olive transition-[width] duration-300" style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} />
      </div>
    </div>
  );
}

function StepIntro({
  headingRef,
  eyebrow,
  title,
  description,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <>
      {eyebrow ? <p className="mb-3 text-sm font-medium text-olive">{eyebrow}</p> : null}
      <h1 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-3xl leading-snug text-forest focus:outline-none sm:text-4xl">
        {title}
      </h1>
      {description ? <p className="mt-3 max-w-lg leading-7 text-muted">{description}</p> : null}
      <div className="mt-8">{children}</div>
    </>
  );
}

/** Shared look for choice tiles. Base and checked states never share ring utilities. */
function choiceClass(checked: boolean) {
  return cn(
    "cursor-pointer rounded-2xl ring-inset transition-[box-shadow,background-color] duration-150",
    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-olive",
    checked ? "bg-olive-100/50 ring-2 ring-forest" : "bg-white/70 ring-1 ring-line hover:bg-white hover:ring-sage",
  );
}

/** Native radios styled as choice rows — arrow keys and screen readers work for free. */
function RadioCards<T extends string | number>({
  name,
  label,
  options,
  value,
  onChange,
  columns = 1,
}: {
  name: string;
  label: string;
  options: { value: T; label: ReactNode; description?: string; icon?: IconName }[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={cn("relative flex items-start gap-3 px-4 py-4", choiceClass(checked))}
            >
              <input
                type="radio"
                name={name}
                value={String(o.value)}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors",
                  checked ? "bg-forest text-cream ring-forest dark:bg-olive dark:ring-olive" : "ring-sage",
                )}
              >
                {checked ? <Icon name="check" size={13} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-forest">{o.label}</span>
                {o.description ? <span className="mt-0.5 block text-sm leading-6 text-muted">{o.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function normalizeArabic(s: string) {
  return s
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/^ال/, "")
    .replace(/\s+ال/g, " ")
    .toLowerCase()
    .trim();
}

function SurahPicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = normalizeArabic(query);
    if (!q) return SURAHS;
    const digits = query.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
    return SURAHS.filter(
      (s) =>
        normalizeArabic(s.nameAr).includes(q) ||
        s.nameEn.toLowerCase().replace(/[^a-z]/g, "").includes(q.replace(/[^a-z]/g, "") || "\u0000") ||
        String(s.number) === digits,
    );
  }, [query]);

  // keep the chosen surah visible when picked from the quick list
  useEffect(() => {
    if (!value) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-surah="${value}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [value]);

  return (
    <div>
      <div className="mb-5">
        <p id="quick-label" className="mb-2 text-sm text-muted">
          اختيارات سريعة
        </p>
        <div role="group" aria-labelledby="quick-label" className="flex flex-wrap gap-2">
          {QUICK_SURAHS.map((n) => {
            const m = getSurahMeta(n)!;
            const active = value === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setQuery("");
                  onChange(n);
                }}
                className={cn(
                  "h-10 rounded-full px-4 font-display text-lg transition-colors",
                  active ? "bg-forest text-cream dark:bg-olive" : "bg-parchment text-forest hover:bg-sage",
                )}
              >
                {m.nameAr}
              </button>
            );
          })}
        </div>
      </div>

      <label htmlFor="surah-search" className="sr-only">
        ابحث عن سورة
      </label>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute inset-y-0 start-4 my-auto text-muted" />
        <input
          id="surah-search"
          type="search"
          className={cn(inputClass, "ps-11")}
          placeholder="ابحث باسم السورة أو رقمها"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter never jumps to the next question from here; it picks a lone match.
            if (e.key === "Enter") {
              e.preventDefault();
              if (results.length === 1) onChange(results[0].number);
            }
          }}
          aria-controls="surah-list"
        />
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">السور</legend>
        <div
          ref={listRef}
          id="surah-list"
          className="max-h-[22rem] overflow-y-auto rounded-2xl bg-white/60 ring-1 ring-inset ring-line"
        >
          {results.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">لا توجد سورة بهذا الاسم. جرّب كتابة جزء من الاسم أو رقم السورة.</p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((s) => {
                const checked = value === s.number;
                return (
                  <li key={s.number} data-surah={s.number}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors has-[:focus-visible]:bg-olive-100/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-olive",
                        checked ? "bg-olive-100/70" : "hover:bg-parchment/70",
                      )}
                    >
                      <input
                        type="radio"
                        name="surah"
                        value={s.number}
                        checked={checked}
                        onChange={() => onChange(s.number)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-xl text-sm num",
                          checked ? "bg-forest text-cream dark:bg-olive" : "bg-parchment text-olive-600",
                        )}
                      >
                        {toArabicDigits(s.number)}
                      </span>
                      <span className="flex-1 font-display text-xl text-forest">{s.nameAr}</span>
                      <span className="text-xs text-muted">
                        {ayahsLabel(s.ayahCount)} · {revelationLabel(s.revelation)}
                      </span>
                      {checked ? <Icon name="check" size={18} className="text-forest" /> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </fieldset>
    </div>
  );
}

function AyahStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.round(n)));
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div>
      <div className="flex items-center justify-center gap-5 sm:gap-8">
        <StepButton icon="minus" label="الآية السابقة" disabled={value <= 1} onClick={() => onChange(clamp(value - 1))} />
        <div className="min-w-40 text-center">
          <label htmlFor="ayah-input" className="block text-sm text-muted">
            توقفت عند الآية
          </label>
          <input
            id="ayah-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= max) onChange(Math.round(n));
            }}
            onBlur={() => setText(String(value))}
            className="mt-1 w-40 appearance-none bg-transparent text-center font-display text-6xl text-forest num focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-olive"
            aria-describedby="ayah-hint"
          />
          <p className="mt-1 text-sm text-muted num">من {toArabicDigits(max)}</p>
        </div>
        <StepButton icon="plus" label="الآية التالية" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} />
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <label htmlFor="ayah-range" className="sr-only">
          اختر الآية بالمنزلق
        </label>
        <input
          id="ayah-range"
          type="range"
          min={1}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-valuetext={`الآية ${toArabicDigits(value)} من ${toArabicDigits(max)}`}
          className="w-full accent-[var(--color-olive)]"
        />
        <div aria-hidden className="mt-1 flex justify-between text-xs text-muted num">
          <span>{toArabicDigits(1)}</span>
          <span>{toArabicDigits(max)}</span>
        </div>
      </div>

      <p id="ayah-hint" className="mx-auto mt-8 flex max-w-md items-start gap-2 rounded-2xl bg-parchment px-4 py-3 text-sm leading-7 text-ink/75">
        <Icon name="info" size={17} className="mt-1 text-olive" />
        {value === 1
          ? "ستبدأ السورة من أولها بإذن الله."
          : `سيبدأ وردك القادم من الآية ${toArabicDigits(value)}، وتنضم ${value - 1 === 1 ? "الآية الأولى" : `الآيات ${toArabicDigits(1)}–${toArabicDigits(value - 1)}`} إلى مراجعتك.`}
      </p>
    </div>
  );
}

function StepButton({ icon, label, disabled, onClick }: { icon: IconName; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-forest ring-1 ring-inset ring-line transition-colors hover:bg-parchment disabled:opacity-40"
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

function DailyTarget({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const meta = draft.surah ? getSurahMeta(draft.surah) : undefined;
  const remaining = meta ? meta.ayahCount - draft.stoppedAt + 1 : 0;
  const valid = draft.target >= 1 && draft.target <= 50;
  const days = valid && remaining ? Math.ceil(remaining / draft.target) : null;

  return (
    <div>
      <fieldset>
        <legend className="sr-only">عدد الآيات اليومي</legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {TARGETS.map((n) => {
            const checked = !draft.customTarget && draft.target === n;
            return (
              <label
                key={n}
                className={cn("flex flex-col items-center py-4", choiceClass(checked))}
              >
                <input type="radio" name="target" className="sr-only" checked={checked} onChange={() => update({ target: n, customTarget: false })} />
                <span className="font-display text-3xl text-forest num">{toArabicDigits(n)}</span>
                <span className="text-xs text-muted">{n <= 10 ? "آيات" : "آية"}</span>
              </label>
            );
          })}
          <label
            className={cn("flex flex-col items-center justify-center py-4 text-center", choiceClass(draft.customTarget))}
          >
            <input type="radio" name="target" className="sr-only" checked={draft.customTarget} onChange={() => update({ customTarget: true })} />
            <Icon name="plus" size={18} className="text-olive" />
            <span className="mt-1 text-sm text-forest">عدد آخر</span>
          </label>
        </div>
      </fieldset>

      {draft.customTarget ? (
        <div className="mt-5 max-w-xs animate-rise">
          <label htmlFor="custom-target" className="mb-1.5 block text-sm font-medium text-forest">
            عدد الآيات يوميًا
          </label>
          <input
            id="custom-target"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            autoFocus
            className={cn(inputClass, !valid && "ring-terracotta/60!")}
            value={Number.isFinite(draft.target) ? draft.target : ""}
            onChange={(e) => update({ target: e.target.value === "" ? NaN : Math.round(Number(e.target.value)) })}
            aria-invalid={!valid || undefined}
            aria-describedby="custom-target-hint"
          />
          <p id="custom-target-hint" className={cn("mt-1.5 text-xs", valid ? "text-muted" : "text-terracotta")}>
            من آية واحدة إلى ٥٠ آية.
          </p>
        </div>
      ) : null}

      {meta && days ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-ink/75" aria-live="polite">
          <Icon name="calendar" size={17} className="text-olive" />
          بهذا المعدل تُتمّ سورة {meta.nameAr} في نحو {daysLabel(days)} بإذن الله.
        </p>
      ) : null}
    </div>
  );
}

function ReminderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isSuggestion = REMINDER_SUGGESTIONS.some((s) => s.time === value);
  return (
    <div>
      <fieldset>
        <legend className="sr-only">أوقات مقترحة</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {REMINDER_SUGGESTIONS.map((s) => {
            const checked = s.time === value;
            return (
              <label
                key={s.time}
                className={cn("flex flex-col px-4 py-4", choiceClass(checked))}
              >
                <input type="radio" name="reminder" className="sr-only" checked={checked} onChange={() => onChange(s.time)} />
                <span className="font-medium text-forest">{s.label}</span>
                <span className="mt-1 text-sm text-muted num">{formatTime(s.time)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label htmlFor="reminder-time" className="text-sm text-muted">
          أو اختر وقتًا آخر
        </label>
        <input
          id="reminder-time"
          type="time"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className={cn(inputClass, "w-40", !isSuggestion && "ring-2! ring-forest!")}
        />
      </div>
      <p className="mt-4 text-xs leading-6 text-muted">تذكير واحد لطيف في اليوم، ويمكنك إيقافه أو تغييره متى شئت.</p>
    </div>
  );
}

function PlanSummary({ draft, headingRef }: { draft: Draft; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const meta = getSurahMeta(draft.surah!)!;
  const remaining = meta.ayahCount - draft.stoppedAt + 1;
  const days = Math.ceil(remaining / draft.target);
  const firstTo = Math.min(meta.ayahCount, draft.stoppedAt + draft.target - 1);
  const name = draft.name.trim();

  const rows: { icon: IconName; label: string; value: ReactNode; note?: string }[] = [
    {
      icon: "bookmark",
      label: "نقطة البداية",
      value: `سورة ${meta.nameAr} · الآية ${toArabicDigits(draft.stoppedAt)}`,
      note: draft.stoppedAt > 1 ? `وتنضم ${ayahsLabel(draft.stoppedAt - 1)} قبلها إلى مراجعتك.` : "من أول السورة.",
    },
    {
      icon: "mushaf",
      label: "ورد اليوم",
      value: `${rangeLabel(draft.stoppedAt, firstTo)}`,
      note: `${ayahsLabel(draft.target)} كل يوم، ويتقدّم الورد معك تلقائيًا.`,
    },
    {
      icon: "review",
      label: "إيقاع المراجعة",
      value: `${sessionsLabel(draft.sessions)} يوميًا`,
      note: "مراجعة متباعدة تقدّم ما يحتاج تثبيتًا.",
    },
    { icon: "bell", label: "وقت التذكير", value: formatTime(draft.reminderTime) },
  ];

  return (
    <>
      <p className="mb-3 text-sm font-medium text-olive">{name ? `${name}، خطتك جاهزة` : "خطتك جاهزة"}</p>
      <h1 id="step-title" ref={headingRef} tabIndex={-1} className="font-display text-4xl leading-snug text-forest focus:outline-none">
        خطتك مع مُدّكِر
      </h1>

      <div className="relative mt-8 overflow-hidden rounded-[var(--radius-card)] bg-forest p-6 text-cream sm:p-8">
        <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.12]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-cream/70">تُتمّ سورة {meta.nameAr} في نحو</p>
            <p className="mt-1 font-display text-5xl num">{daysLabel(days)}</p>
          </div>
          <p className="text-sm text-cream/70 num">
            {ayahsLabel(remaining)} متبقية ÷ {ayahsLabel(draft.target)} يوميًا
          </p>
        </div>
      </div>

      <dl className="mt-8 divide-y divide-line border-y hairline">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-4 py-5">
            <Icon name={r.icon} size={20} className="mt-0.5 text-olive" />
            <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd className="mt-1 sm:mt-0 sm:text-end">
                <span className="font-medium text-forest">{r.value}</span>
                {r.note ? <span className="mt-0.5 block text-xs text-muted">{r.note}</span> : null}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      <p className="mt-6 flex items-start gap-2 text-sm leading-7 text-ink/70">
        <Icon name="leaf" size={17} className="mt-1 text-olive" />
        خطة مرنة لا تحاسبك على يوم فاتك؛ إن انقطعت عدنا معك من حيث توقفت. ويمكنك تعديلها متى شئت من الإعدادات.
      </p>
    </>
  );
}
