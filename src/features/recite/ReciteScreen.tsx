"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantSheet } from "@/components/assistant/AssistantLauncher";
import { AudioPlayer } from "@/components/quran/AudioPlayer";
import { SourceLine } from "@/components/quran/QuranVerse";
import { useAyahAudio } from "@/components/quran/useAyahAudio";
import { BetaNote, RecitationFeedback, TextOnlyNote } from "@/components/recitation/RecitationFeedback";
import { RecitationRecorder } from "@/components/recitation/RecitationRecorder";
import { SelfGradeButtons } from "@/components/review/SelfReview";
import { useRecitationRecorder } from "@/components/recitation/useRecitationRecorder";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button, ButtonLink, cn, EmptyState, ErrorState, Toggle } from "@/components/ui/primitives";
import { FocusActionBar, FocusHeader } from "@/features/focus/FocusHeader";
import { SOURCE_UNAVAILABLE } from "@/features/quran/states";
import { api, useOnline, useSurah } from "@/lib/api";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { analyzeRecitation } from "@/lib/recitation/compare";
import { clampRange, firstWord, memorizedRanges } from "@/lib/recitation/ranges";
import { simulateTranscript } from "@/lib/recitation/simulate";
import { ayahCountLabel, rangeLabel, relativeDueLabel } from "@/lib/review/labels";
import { useApp } from "@/lib/store/AppProvider";
import { isDueForReview, selfAssessable } from "@/lib/review/self-review";
import { reviewQueue, todaysWird } from "@/lib/store/selectors";
import type { AyahRange, RecitationAnalysis, SurahMeta, Transcript } from "@/lib/types";

const DEV = process.env.NODE_ENV !== "production";

export function ReciteScreen() {
  const search = useSearchParams();
  const surah = Number(search.get("surah"));
  const meta = Number.isInteger(surah) ? getSurahMeta(surah) : undefined;
  const fromQ = Number(search.get("from"));
  if (!meta || !fromQ) return <RangeSelector />;
  const toQ = Number(search.get("to")) || fromQ;
  const range = clampRange(meta.number, fromQ, toQ, meta.ayahCount);
  const mode = search.get("mode") === "review" ? "review" : "practice";
  return <ReciteSession key={`${range.surah}:${range.from}-${range.to}`} meta={meta} range={range} clamped={range.clamped} mode={mode} />;
}

// ── 1. Range selector ─────────────────────────────────────────────────────
function RangeSelector() {
  const { state } = useApp();
  const due = useMemo(() => reviewQueue(state).filter((r) => r.bucket === "today" || r.bucket === "weak").slice(0, 4), [state]);
  const groups = useMemo(() => {
    const by = new Map<number, AyahRange[]>();
    for (const r of memorizedRanges(Object.values(state.progress))) by.set(r.surah, [...(by.get(r.surah) ?? []), r]);
    return [...by.entries()];
  }, [state.progress]);
  const wird = todaysWird(state);

  return (
    <div className="min-h-dvh">
      <FocusHeader exitHref="/dashboard" exitLabel="الخروج إلى الرئيسية" title="التسميع" subtitle="اختر مقطعًا تسمّعه من حفظك" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {!groups.length ? (
          <EmptyState
            icon="mic"
            title="لم تسجّل آيات محفوظة بعد"
            body="احفظ وردك أولًا، ثم عُد لتسمّعه ونجدول مراجعته."
            action={
              wird ? (
                <ButtonLink href={`/memorize/${wird.surah}?from=${wird.from}&to=${wird.to}`} icon="leaf">
                  احفظ ورد اليوم
                </ButtonLink>
              ) : (
                <ButtonLink href="/quran" icon="mushaf">
                  اختر سورة
                </ButtonLink>
              )
            }
          />
        ) : (
          <>
            {due.length ? (
              <section aria-labelledby="due-title">
                <h2 id="due-title" className="text-base font-semibold text-forest mb-3">
                  مقترح الآن من مراجعاتك
                </h2>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {due.map((r) => (
                    <li key={`${r.surah}:${r.from}`}>
                      <RangeLink range={r} mode="review" hint={r.bucket === "weak" ? "تحتاج مراجعة" : "مراجعة اليوم"} weak={r.bucket === "weak"} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="mem-title">
              <h2 id="mem-title" className="text-base font-semibold text-forest mb-3">
                محفوظاتك
              </h2>
              <ul className="space-y-3">
                {groups.map(([s, ranges]) => (
                  <li key={s} className="rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line p-4">
                    <p className="font-display text-xl text-forest">سورة {getSurahMeta(s)?.nameAr}</p>
                    <ul className="mt-2.5 flex flex-wrap gap-2">
                      {ranges.map((r) => (
                        <li key={r.from}>
                          <Link
                            href={`/recite?surah=${r.surah}&from=${r.from}&to=${r.to}`}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-parchment text-sm text-forest hover:bg-olive-100 transition-colors"
                          >
                            <Icon name="mic" size={14} className="text-olive" />
                            {rangeLabel(r.from, r.to)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <BetaNote />
        <TextOnlyNote className="justify-center" />
      </div>
    </div>
  );
}

function RangeLink({ range, mode, hint, weak }: { range: AyahRange; mode?: "review"; hint: string; weak?: boolean }) {
  const meta = getSurahMeta(range.surah);
  return (
    <Link
      href={`/recite?surah=${range.surah}&from=${range.from}&to=${range.to}${mode ? `&mode=${mode}` : ""}`}
      className="group flex items-center gap-3 rounded-[var(--radius-card)] bg-white/75 ring-1 ring-line p-4 hover:shadow-[var(--shadow-soft)] transition-shadow"
    >
      <span className={cn("grid place-items-center size-11 rounded-full", weak ? "bg-sand-100 text-sand-700" : "bg-olive-100 text-olive")}>
        <Icon name="mic" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl text-forest">سورة {meta?.nameAr}</span>
        <span className="block text-xs text-muted">
          {rangeLabel(range.from, range.to)} · {hint}
        </span>
      </span>
      <Icon name="forward" size={18} className="text-muted group-hover:text-forest" />
    </Link>
  );
}

// ── 2–6. Session ──────────────────────────────────────────────────────────
type Stage = "ready" | "analyzing" | "analysis-error" | "feedback";

function ReciteSession({
  meta,
  range,
  clamped,
  mode,
}: {
  meta: SurahMeta;
  range: AyahRange;
  clamped: boolean;
  mode: "review" | "practice";
}) {
  const { state, actions } = useApp();
  const online = useOnline();
  const surah = useSurah(meta.number);
  const verses = useMemo(() => (surah.data?.ayahs ?? []).filter((a) => a.ayah >= range.from && a.ayah <= range.to), [surah.data, range]);
  const audio = useAyahAudio(verses);

  const [stage, setStage] = useState<Stage>("ready");
  const [analysis, setAnalysis] = useState<RecitationAnalysis | null>(null);
  const [analyzedOnDevice, setAnalyzedOnDevice] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hints, setHints] = useState(false);
  const [listen, setListen] = useState(false);
  const [askAyah, setAskAyah] = useState<number | null>(null);
  const lastTranscript = useRef<Transcript | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const versesRef = useRef(verses);
  versesRef.current = verses;

  const analyze = useCallback(
    async (t: Transcript) => {
      lastTranscript.current = t;
      setStage("analyzing");
      try {
        // The server loads the verified text itself and returns the alignment.
        const a = await api.analyze(range, t);
        setAnalysis(a);
        setAnalyzedOnDevice(false);
        setStage("feedback");
      } catch {
        // API unreachable → same pure analysis on the verified verses already loaded.
        const vs = versesRef.current;
        if (vs.length === range.to - range.from + 1) {
          setAnalysis(analyzeRecitation(vs, t, range));
          setAnalyzedOnDevice(true);
          setStage("feedback");
        } else {
          setStage("analysis-error");
        }
      }
    },
    [range],
  );

  const rec = useRecitationRecorder({ range, onTranscript: analyze });

  useEffect(() => {
    if (stage === "feedback") resultRef.current?.focus();
  }, [stage]);

  function retry() {
    audio.stop();
    setListen(false);
    setAnalysis(null);
    setSaved(false);
    rec.reset();
    setStage("ready");
    window.scrollTo({ top: 0 });
  }

  function save() {
    if (!analysis || saved) return;
    actions.recordRecitation(analysis);
    setSaved(true);
  }

  // What saving can actually do: only a well-heard, validated-recognizer result with at least one judged ayah schedules anything.
  const changesLearning = !!analysis && analysis.learningEligible && analysis.recognition === "good" && analysis.ayahs.some((a) => a.status !== "uncertain");
  const nextReview = useMemo(() => {
    if (!saved || !analysis || !changesLearning) return null;
    const dates = analysis.ayahs.map((a) => state.progress[a.key]?.nextReviewAt).filter((d): d is string => !!d).sort();
    return dates[0] ?? null;
  }, [saved, analysis, changesLearning, state.progress]);

  const recording = rec.phase === "recording" || rec.phase === "starting" || rec.phase === "transcribing";
  const count = range.to - range.from + 1;
  const exitHref = mode === "review" ? "/review" : `/quran/${meta.number}#ayah-${range.from}`;

  return (
    <div className="min-h-dvh flex flex-col">
      <FocusHeader
        exitHref={exitHref}
        exitLabel={mode === "review" ? "الخروج إلى المراجعة" : `الخروج إلى سورة ${meta.nameAr}`}
        title={`تسميع سورة ${meta.nameAr}`}
        subtitle={`${rangeLabel(range.from, range.to)} · ${ayahCountLabel(count)}`}
      />

      <div className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6">
        {!online && stage === "ready" && !recording ? (
          <div role="status" className="mt-4 flex items-center gap-2 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-sand-800">
            <Icon name="wifiOff" size={17} />
            أنت غير متصل. يحتاج التسميع إلى اتصال لتحويل التلاوة إلى نص.
          </div>
        ) : null}

        {stage === "ready" ? (
          <div className="py-6 sm:py-8 space-y-7">
            {/* range summary */}
            <section
              aria-label="المقطع"
              className={cn(
                "flex items-center gap-4 rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25 px-5 py-4 transition-opacity",
                recording && "opacity-80",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-2xl text-forest">سورة {meta.nameAr}</p>
                  {mode === "review" ? <Badge tone="olive">مراجعة</Badge> : null}
                </div>
                <p className="text-sm text-muted">
                  {rangeLabel(range.from, range.to)} · {ayahCountLabel(count)}
                </p>
                {clamped ? <p className="mt-1 text-xs text-sand-700">عدّلنا المقطع ليبقى ضمن حدود السورة و٣٠ آية في الجلسة.</p> : null}
              </div>
              {!recording ? (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Link href="/recite" className="text-sm text-olive hover:text-forest underline-offset-4 hover:underline">
                    تغيير المقطع
                  </Link>
                  <button type="button" onClick={() => setAskAyah(range.from)} className="inline-flex items-center gap-1.5 text-sm text-olive hover:text-forest underline-offset-4 hover:underline">
                    <Icon name="lamp" size={14} /> اسأل مُدّكِر
                  </button>
                </div>
              ) : null}
            </section>

            <RecitationRecorder
              rec={rec}
              footer={
                DEV && verses.length ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void analyze(simulateTranscript(verses, (Date.now() % 89) + 1))}
                      className="inline-flex items-center gap-2 rounded-xl border border-dashed border-muted/50 px-3.5 h-9 text-xs text-muted hover:text-forest hover:border-olive"
                    >
                      <Icon name="settings" size={14} />
                      محاكاة تسميع (للتجربة)
                      <span className="rounded bg-parchment px-1.5 py-0.5 text-[0.65rem]">بيئة التطوير فقط</span>
                    </button>
                  </div>
                ) : null
              }
            />

            {/* first-word hints */}
            <section aria-label="تلميحات" className="rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line px-4 sm:px-5">
              <Toggle checked={hints} onChange={setHints} label="إظهار أول كلمة من كل آية" description="تلميح خفيف يساعدك على الانتقال بين الآيات." />
              {hints ? (
                surah.error ? (
                  <div className="pb-4 flex flex-wrap items-center gap-2 text-sm text-terracotta" role="alert">
                    {SOURCE_UNAVAILABLE}
                    <Button variant="quiet" size="sm" onClick={surah.retry}>
                      إعادة المحاولة
                    </Button>
                  </div>
                ) : !verses.length ? (
                  <div className="pb-4 flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-9 w-24 rounded-full" />
                    ))}
                  </div>
                ) : (
                  <div className="pb-4">
                    <ol className="flex flex-wrap gap-2">
                      {verses.map((a) => (
                        <li
                          key={a.key}
                          className="inline-flex items-center gap-2 rounded-full bg-parchment ps-1.5 pe-3.5 h-10 animate-rise"
                        >
                          <span className="grid place-items-center size-7 rounded-full bg-white text-xs text-olive num">{toArabicDigits(a.ayah)}</span>
                          <span lang="ar" className="font-quran text-xl leading-none text-ink">
                            {firstWord(a.textUthmani)}
                          </span>
                          <span aria-hidden className="text-muted">…</span>
                        </li>
                      ))}
                    </ol>
                    {surah.data ? (
                      <div className="mt-3">
                        <SourceLine title={surah.data.source.title} url={surah.data.source.url} />
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}
            </section>

            {/* how it works + privacy */}
            {!recording ? (
              <section aria-label="كيف يعمل التسميع" className="space-y-3 text-sm leading-7 text-ink/75">
                <p className="flex items-start gap-2.5">
                  <Icon name="mic" size={17} className="mt-1 text-olive" />
                  تلُ الآيات من حفظك بصوت واضح وفي مكان هادئ. عند الانتهاء اضغط «إنهاء التسميع» وسنقارن ما سمعناه بالنص الموثّق كلمةً كلمة.
                </p>
                <p className="flex items-start gap-2.5">
                  <Icon name="shield" size={17} className="mt-1 text-olive" />
                  لا نحفظ تسجيلك؛ يُحوَّل إلى نص ثم يُحذف.
                </p>
                <BetaNote />
                <TextOnlyNote />
              </section>
            ) : null}
          </div>
        ) : stage === "analyzing" ? (
          <div className="py-24 flex flex-col items-center text-center" role="status" aria-live="polite">
            <span className="relative grid place-items-center size-24">
              <span aria-hidden className="absolute inset-0 rounded-full bg-olive-100 motion-safe:animate-breathe" />
              <span className="relative grid place-items-center size-16 rounded-full bg-white ring-1 ring-line text-olive">
                <Icon name="mushaf" size={28} />
              </span>
            </span>
            <p className="mt-6 font-display text-3xl text-forest">نراجع تلاوتك…</p>
            <p className="mt-2 text-sm text-muted">نقارن الكلمات بالنص الموثّق</p>
          </div>
        ) : stage === "analysis-error" ? (
          <div className="py-16">
            <ErrorState
              icon={online ? "alert" : "wifiOff"}
              title={online ? "تعذّرت مراجعة التلاوة الآن" : "أنت غير متصل"}
              body={online ? `${SOURCE_UNAVAILABLE}. أعد المحاولة بعد قليل.` : "عُد إلى الاتصال ثم أعد المحاولة؛ لن تحتاج إلى التسميع من جديد."}
              onRetry={() => {
                surah.retry();
                if (lastTranscript.current) void analyze(lastTranscript.current);
              }}
            />
            <div className="flex justify-center">
              <Button variant="quiet" onClick={retry}>
                أعد التسميع
              </Button>
            </div>
          </div>
        ) : analysis ? (
          <div ref={resultRef} tabIndex={-1} className="py-6 sm:py-8 focus:outline-none" aria-label="نتيجة التسميع">
            <RecitationFeedback
              analysis={analysis}
              note={
                analyzedOnDevice ? (
                  <p className="text-xs text-muted">تمت المطابقة على جهازك لتعذّر الوصول إلى الخادم، باستخدام النص الموثّق نفسه.</p>
                ) : analysis.transcript.provider === "dev:simulation" ? (
                  <p className="text-xs text-sand-700">نتيجة محاكاة للتجربة — ليست تلاوة حقيقية.</p>
                ) : null
              }
              actions={
                <div className="space-y-4">
                  {saved ? (
                    <div role="status" className="rounded-[var(--radius-card)] bg-olive-100/60 px-5 py-4 animate-rise">
                      <p className="flex items-center gap-2 font-semibold text-forest">
                        <Icon name="checkCircle" size={19} className="text-olive" />
                        {changesLearning ? "حُفظت النتيجة وجُدولت المراجعة" : "حُفظت المحاولة في سجلّك — دون تغيير مراجعاتك"}
                      </p>
                      <p className="mt-1 text-sm text-ink/75">
                        {nextReview ? (
                          <>
                            موعد مراجعتك القادمة لهذا المقطع: <strong className="text-forest">{relativeDueLabel(nextReview)}</strong>.
                          </>
                        ) : null}{" "}
                        {changesLearning ? "كلما أتقنت التسميع تباعدت المراجعات." : "لم يتغيّر تقدّمك لأن هذه المحاولة لم تُحتسب أو لم نتأكد من كل الكلمات."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ButtonLink href="/review" size="sm" variant="secondary" icon="review">
                          مراجعاتي
                        </ButtonLink>
                        <ButtonLink href="/dashboard" size="sm" variant="quiet" icon="home">
                          الرئيسية
                        </ButtonLink>
                      </div>
                    </div>
                  ) : null}
                  <SelfAssessPrompt analysis={analysis} />
                  {listen ? <AudioPlayer audio={audio} ayahs={verses} title="استمع للآيات" defaultOpen /> : null}
                </div>
              }
            />
          </div>
        ) : null}
      </div>

      <AssistantSheet
        open={askAyah !== null}
        onClose={() => setAskAyah(null)}
        context={askAyah !== null ? { surah: meta.number, ayah: askAyah } : undefined}
        ayahRange={{ from: range.from, to: range.to }}
        onAyahChange={setAskAyah}
      />

      {stage === "feedback" && analysis ? (
        <FocusActionBar label="إجراءات النتيجة">
          <div className="grid grid-cols-2 sm:flex gap-2 sm:justify-center">
            {analysis.recognition !== "good" ? (
              <Button className="col-span-2" icon="mic" onClick={retry}>
                أعد التسميع
              </Button>
            ) : (
              <>
                {!saved ? (
                  <Button className="col-span-2" icon={changesLearning ? "calendar" : "check"} onClick={save}>
                    {changesLearning ? "حفظ النتيجة وجدولة المراجعة" : "حفظ المحاولة في السجل"}
                  </Button>
                ) : null}
                <Button variant="ghost" icon="review" onClick={retry} className={saved ? "col-span-1" : ""}>
                  أعد المحاولة
                </Button>
              </>
            )}
            <Button
              variant="quiet"
              icon="volume"
              aria-pressed={listen}
              disabled={!verses.length}
              onClick={() => {
                if (listen) audio.stop();
                setListen((v) => !v);
              }}
            >
              {listen ? "إخفاء الاستماع" : "استمع للآيات"}
            </Button>
          </div>
        </FocusActionBar>
      ) : null}
    </div>
  );
}

/**
 * When the recitation could not decide an ayah (unclear audio, unvalidated recognizer, doubtful words), the
 * learner may assess the review themselves. Confirmed outcomes never get this offer.
 */
function SelfAssessPrompt({ analysis }: { analysis: RecitationAnalysis }) {
  const { state } = useApp();
  const now = useMemo(() => new Date(), []);
  const ranges = useMemo(() => {
    const keys = selfAssessable(analysis)
      .filter((k) => {
        const p = state.progress[k];
        return !!p && isDueForReview(p, now);
      })
      .map((k) => k.split(":").map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out: AyahRange[] = [];
    for (const [surah, ayah] of keys) {
      const last = out[out.length - 1];
      if (last && last.surah === surah && last.to + 1 === ayah) last.to = ayah;
      else out.push({ surah, from: ayah, to: ayah });
    }
    return out;
  }, [analysis, state.progress, now]);
  if (!ranges.length) return null;
  const unheard = analysis.recognition !== "good";
  return (
    <section aria-label="قيّم مراجعتك" className="rounded-[var(--radius-card)] bg-white ring-1 ring-sand/40 px-4 py-4 sm:px-5">
      <p className="text-sm leading-7 text-ink/85">
        {unheard
          ? "لم نسمع تلاوتك بوضوح، فلم نحتسب شيئًا. أعد التسميع، أو قيّم مراجعتك بنفسك:"
          : "لم نتأكد من بعض الآيات، فلم نحتسب عليك شيئًا. أعد الجزء، أو قيّم مراجعتك بنفسك:"}
      </p>
      <SelfGradeButtons ranges={ranges} className="mt-3" />
    </section>
  );
}
