"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AssistantSheet } from "@/components/assistant/AssistantLauncher";
import { AudioPlayer } from "@/components/quran/AudioPlayer";
import { QuranVerse, SourceLine } from "@/components/quran/QuranVerse";
import { TafsirNote } from "@/components/quran/TafsirNote";
import { useAyahAudio } from "@/components/quran/useAyahAudio";
import { useTafsir } from "@/components/quran/useTafsir";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, ButtonLink, cn, EmptyState, IconButton } from "@/components/ui/primitives";
import { FocusActionBar, FocusHeader } from "@/features/focus/FocusHeader";
import { SourceError, VerseSkeleton } from "@/features/quran/states";
import { useSurah } from "@/lib/api";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { MAX_RECITE_AYAHS } from "@/lib/recitation/ranges";
import { ayahCountLabel, rangeLabel } from "@/lib/review/labels";
import { isMemorized, startAyahFor } from "@/lib/review/learning";
import { useApp } from "@/lib/store/AppProvider";
import type { SurahMeta } from "@/lib/types";

export function MemorizeScreen() {
  const params = useParams<{ surah: string }>();
  const meta = getSurahMeta(Number(params?.surah));
  if (!meta) {
    return (
      <>
        <FocusHeader exitHref="/quran" exitLabel="الخروج إلى المصحف" title="الحفظ" />
        <EmptyState icon="mushaf" title="لم نجد هذه السورة" action={<ButtonLink href="/quran">تصفّح السور</ButtonLink>} />
      </>
    );
  }
  return <MemorizeSession key={meta.number} meta={meta} />;
}

function MemorizeSession({ meta }: { meta: SurahMeta }) {
  const n = meta.number;
  const router = useRouter();
  const search = useSearchParams();
  const { state, actions } = useApp();
  const surah = useSurah(n);

  // ── Range (defaults: resume ayah → daily target) ───────────────────────
  const daily = state.profile?.dailyTargetAyahs ?? state.goals.dailyAyahs ?? 5;
  const clamp = (v: number) => Math.min(meta.ayahCount, Math.max(1, Math.floor(v) || 1));
  const [from, setFrom] = useState(() => {
    const q = Number(search.get("from"));
    if (q) return clamp(q);
    return clamp(startAyahFor(state, n));
  });
  const [to, setTo] = useState(() => {
    const q = Number(search.get("to"));
    const f = clamp(Number(search.get("from")) || startAyahFor(state, n));
    const t = q ? clamp(q) : clamp(f + daily - 1);
    return Math.min(Math.max(t, f), f + MAX_RECITE_AYAHS - 1);
  });
  const [editing, setEditing] = useState(false);

  function setRange(f: number, t: number) {
    const nf = clamp(f);
    let nt = clamp(Math.max(t, nf));
    if (nt - nf + 1 > MAX_RECITE_AYAHS) nt = nf + MAX_RECITE_AYAHS - 1;
    setFrom(nf);
    setTo(nt);
  }

  // keep the URL shareable / restorable
  useEffect(() => {
    router.replace(`/memorize/${n}?from=${from}&to=${to}`, { scroll: false });
  }, [router, n, from, to]);

  // "continue from the exact ayah": opening new (not yet memorized) material
  // becomes the resume point; revising an older range never moves it back.
  const startIsNew = !isMemorized(state.progress[`${n}:${from}`]);
  useEffect(() => {
    if (startIsNew) actions.setResume({ surah: n, ayah: from, mode: "memorize" });
  }, [actions, n, from, startIsNew]);

  const ayahs = useMemo(() => (surah.data?.ayahs ?? []).filter((a) => a.ayah >= from && a.ayah <= to), [surah.data, from, to]);
  const audio = useAyahAudio(ayahs);

  // ── Hiding + meaning ───────────────────────────────────────────────────
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [meaning, setMeaning] = useState(false);
  // the ayah the learner is asking about (opens the assistant with this exact ayah as context)
  const [askAyah, setAskAyah] = useState<number | null>(null);
  const tafsir = useTafsir(n, meaning);
  useEffect(() => setRevealed(new Set()), [from, to]);
  const nextHidden = ayahs.find((a) => !revealed.has(a.ayah));
  const reveal = (ayah: number) => setRevealed((s) => new Set(s).add(ayah));

  // ── Completion ─────────────────────────────────────────────────────────
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const alreadyMemorized = ayahs.length > 0 && ayahs.every((a) => isMemorized(state.progress[a.key]));
  const reciteHref = `/recite?surah=${n}&from=${from}&to=${to}`;

  function complete() {
    audio.stop();
    actions.markMemorized({ surah: n, from, to });
    setDone(true);
  }
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const count = to - from + 1;

  return (
    <div className="min-h-dvh flex flex-col">
      <FocusHeader
        exitHref={`/quran/${n}#ayah-${from}`}
        exitLabel={`الخروج إلى سورة ${meta.nameAr}`}
        title={`سورة ${meta.nameAr}`}
        subtitle={`${rangeLabel(from, to)} · ${ayahCountLabel(count)}`}
        end={
          !done ? (
            <IconButton
              icon="settings"
              label="تعديل المقطع"
              active={editing}
              aria-expanded={editing}
              aria-controls="range-picker"
              onClick={() => setEditing((v) => !v)}
              size={44}
            />
          ) : null
        }
      />

      <div className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6">
        {done ? (
          <Completion
            meta={meta}
            from={from}
            to={to}
            reciteHref={reciteHref}
            headingRef={doneRef}
            onNext={(f, t) => {
              setDone(false);
              setRange(f, t);
              window.scrollTo({ top: 0 });
            }}
          />
        ) : (
          <>
            {/* ── Range picker ─────────────────────────────────── */}
            <section
              id="range-picker"
              hidden={!editing}
              aria-label="اختيار المقطع"
              className="mt-4 rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25 p-4 animate-rise"
            >
              <div className="grid grid-cols-2 gap-4">
                <Stepper label="من الآية" value={from} min={1} max={meta.ayahCount} onChange={(v) => setRange(v, Math.max(to, v))} />
                <Stepper label="إلى الآية" value={to} min={from} max={Math.min(meta.ayahCount, from + MAX_RECITE_AYAHS - 1)} onChange={(v) => setRange(from, v)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>وردك اليومي {ayahCountLabel(daily)}.</span>
                {count !== daily ? (
                  <button type="button" className="underline underline-offset-4 hover:text-forest" onClick={() => setRange(from, from + daily - 1)}>
                    اضبطه على وردك
                  </button>
                ) : null}
              </div>
            </section>

            {/* ── Tools ────────────────────────────────────────── */}
            <div className="mt-4 space-y-3">
              <AudioPlayer audio={audio} ayahs={ayahs} title="استمع وكرّر" />
              <div className="flex flex-wrap gap-2" role="group" aria-label="أدوات الحفظ">
                <Pill
                  icon={hidden ? "eye" : "eyeOff"}
                  pressed={hidden}
                  onClick={() => {
                    setHidden((v) => !v);
                    setRevealed(new Set());
                  }}
                >
                  {hidden ? "إظهار الآيات" : "إخفاء الآيات"}
                </Pill>
                <Pill icon="book" pressed={meaning} onClick={() => setMeaning((v) => !v)}>
                  شرح مختصر
                </Pill>
                {alreadyMemorized ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-olive-100 px-3 h-9 text-xs text-olive-600">
                    <Icon name="checkCircle" size={15} /> محفوظة سابقًا — هذه جلسة تثبيت
                  </span>
                ) : null}
              </div>
              {hidden ? (
                <p className="text-sm text-muted" aria-live="polite">
                  {nextHidden
                    ? "تلُ الآية من حفظك، ثم اضغطها لتتحقق منها."
                    : "أحسنت — كشفت كل الآيات. أخفِها مجددًا لتثبّتها أكثر."}
                </p>
              ) : null}
            </div>

            {/* ── Verses ───────────────────────────────────────── */}
            <section aria-label="آيات المقطع" className="py-8 sm:py-10">
              {surah.loading && !surah.data ? (
                <VerseSkeleton lines={Math.min(count, 5)} />
              ) : surah.error || !surah.data ? (
                <SourceError onRetry={surah.retry} />
              ) : (
                <>
                  <ol className="space-y-8 sm:space-y-10">
                    {ayahs.map((a, i) => {
                      const isHidden = hidden && !revealed.has(a.ayah);
                      const isPlaying = audio.current === i && audio.playing;
                      return (
                        <li key={a.key} id={`ayah-${a.ayah}`} className="scroll-mt-24">
                          <div
                            className={cn(
                              "relative rounded-3xl px-2 py-3 sm:px-6 transition-colors duration-500",
                              isPlaying && "bg-olive-100/50",
                            )}
                          >
                            {isHidden ? (
                              <button
                                type="button"
                                onClick={() => reveal(a.ayah)}
                                aria-label={`أظهر الآية ${toArabicDigits(a.ayah)}`}
                                className="group block w-full rounded-2xl text-center"
                              >
                                <QuranVerse ayah={a} hidden className="text-center text-[clamp(1.7rem,1.3rem+1.6vw,2.55rem)] leading-[2.3]" />
                                <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted group-hover:text-forest">
                                  <Icon name="eye" size={14} /> اضغط للإظهار
                                </span>
                              </button>
                            ) : (
                              <QuranVerse
                                ayah={a}
                                className="text-center text-[clamp(1.7rem,1.3rem+1.6vw,2.55rem)] leading-[2.3] animate-rise"
                              />
                            )}
                            {!isHidden ? (
                              <div className="mt-1 flex justify-center gap-1">
                                <IconButton
                                  icon={isPlaying ? "pause" : "volume"}
                                  label={isPlaying ? "إيقاف مؤقت" : `استمع للآية ${toArabicDigits(a.ayah)}`}
                                  onClick={() => (isPlaying ? audio.pause() : audio.playOne(i))}
                                  size={36}
                                />
                                <IconButton icon="lamp" label={`اسأل مُدّكِر عن الآية ${toArabicDigits(a.ayah)}`} onClick={() => setAskAyah(a.ayah)} size={36} />
                              </div>
                            ) : null}
                          </div>
                          {meaning ? (
                            <TafsirNote
                              className="mt-3 mx-1 sm:mx-6"
                              entry={tafsir.data?.byKey.get(a.key) ?? null}
                              loading={tafsir.loading}
                              error={!!tafsir.error}
                              onRetry={tafsir.retry}
                              label="شرح مختصر — التفسير الميسر"
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {hidden && nextHidden ? (
                    <div className="mt-8 flex justify-center">
                      <Button variant="secondary" icon="eye" onClick={() => reveal(nextHidden.ayah)}>
                        أظهر الآية {toArabicDigits(nextHidden.ayah)}
                      </Button>
                    </div>
                  ) : hidden && ayahs.length ? (
                    <div className="mt-8 flex justify-center">
                      <Button variant="ghost" icon="eyeOff" onClick={() => setRevealed(new Set())}>
                        أخفِ الكل مجددًا
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-10 flex justify-center">
                    <SourceLine title={surah.data.source.title} url={surah.data.source.url} />
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>

      {!done ? (
        <FocusActionBar label="إجراءات الحفظ">
          <Button icon="check" size="lg" onClick={complete} disabled={!ayahs.length}>
            حفظت هذه الآيات
          </Button>
          <ButtonLink href={reciteHref} variant="ghost" size="lg" icon="mic">
            ابدأ التسميع
          </ButtonLink>
        </FocusActionBar>
      ) : null}

      <AssistantSheet
        open={askAyah !== null}
        onClose={() => setAskAyah(null)}
        context={askAyah !== null ? { surah: n, ayah: askAyah } : undefined}
        ayahRange={{ from, to }}
        onAyahChange={setAskAyah}
      />
    </div>
  );
}

function Pill({ icon, pressed, onClick, children }: { icon: IconName; pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm transition-colors",
        pressed ? "bg-forest text-cream dark:bg-olive" : "bg-white ring-1 ring-inset ring-line text-forest hover:bg-parchment",
      )}
    >
      <Icon name={icon} size={16} />
      {children}
    </button>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-forest mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <IconButton icon="minus" label={`${label}: إنقاص`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="bg-white ring-1 ring-line disabled:opacity-40" size={40} />
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-full min-w-0 h-10 rounded-xl bg-white ring-1 ring-inset ring-line text-center font-semibold text-forest num focus:outline-none focus:ring-2 focus:ring-olive"
        />
        <IconButton icon="plus" label={`${label}: زيادة`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="bg-white ring-1 ring-line disabled:opacity-40" size={40} />
      </div>
    </div>
  );
}

function Completion({
  meta,
  from,
  to,
  reciteHref,
  headingRef,
  onNext,
}: {
  meta: SurahMeta;
  from: number;
  to: number;
  reciteHref: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onNext: (from: number, to: number) => void;
}) {
  const { state } = useApp();
  const daily = state.profile?.dailyTargetAyahs ?? state.goals.dailyAyahs ?? 5;
  const surahDone = to >= meta.ayahCount;
  const nextMeta = surahDone ? getSurahMeta(meta.number + 1) : undefined;

  return (
    <section className="py-10 sm:py-16 flex flex-col items-center text-center animate-rise" aria-live="polite">
      <span className="relative grid place-items-center size-24 mb-6">
        <span aria-hidden className="absolute inset-0 rounded-full bg-olive-100 motion-safe:animate-breathe" />
        <span className="relative grid place-items-center size-20 rounded-full bg-olive text-cream">
          <Icon name="check" size={38} />
        </span>
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-4xl text-forest focus:outline-none">
        بارك الله في حفظك
      </h2>
      <p className="mt-3 max-w-md text-[0.95rem] leading-8 text-ink/75">
        سجّلنا {rangeLabel(from, to)} من سورة {meta.nameAr}. أول مراجعة لها غدًا بإذن الله، وسنذكّرك بها في وقتها.
      </p>
      <p className="mt-1 text-sm text-muted">ثبّت ما حفظت الآن بتسميع قصير — هذا أنفع ما تبدأ به.</p>

      <div className="mt-8 w-full max-w-sm flex flex-col gap-2.5">
        <ButtonLink href={reciteHref} size="lg" icon="mic">
          ابدأ التسميع
        </ButtonLink>
        {!surahDone ? (
          <Button variant="secondary" size="lg" iconEnd="forward" onClick={() => onNext(to + 1, Math.min(meta.ayahCount, to + daily))}>
            الورد التالي · {rangeLabel(to + 1, Math.min(meta.ayahCount, to + daily))}
          </Button>
        ) : nextMeta ? (
          <ButtonLink href={`/memorize/${nextMeta.number}?from=1`} variant="secondary" size="lg" iconEnd="forward">
            الورد التالي · سورة {nextMeta.nameAr}
          </ButtonLink>
        ) : null}
        <Link href={`/quran/${meta.number}`} className="mt-2 text-sm text-muted hover:text-forest underline-offset-4 hover:underline">
          العودة إلى سورة {meta.nameAr}
        </Link>
      </div>
    </section>
  );
}
