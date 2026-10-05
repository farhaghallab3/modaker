"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Page } from "@/components/layout/PageHeader";
import { AudioPlayer } from "@/components/quran/AudioPlayer";
import { AyahCard, STATUS_META } from "@/components/quran/AyahCard";
import { QuranVerse, SourceLine } from "@/components/quran/QuranVerse";
import { TafsirNote } from "@/components/quran/TafsirNote";
import { useAyahAudio } from "@/components/quran/useAyahAudio";
import { useTafsir } from "@/components/quran/useTafsir";
import { StoryCard } from "@/components/stories/StoryCard";
import { VideoCard } from "@/components/stories/VideoCard";
import { YouTubeEmbed } from "@/components/stories/YouTubeEmbed";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink, cn, EmptyState, ErrorState, IconButton, ProgressRing, Tabs } from "@/components/ui/primitives";
import { storiesForSurah } from "@/content/stories";
import { videosForSurah, type CuratedVideo } from "@/content/videos";
import { useSurah } from "@/lib/api";
import { getSurahMeta, revelationLabel, toArabicDigits } from "@/lib/quran/surahs";
import { memorizedRanges } from "@/lib/recitation/ranges";
import { ayahCountLabel, percentLabel } from "@/lib/review/labels";
import { useApp } from "@/lib/store/AppProvider";
import { needsReviewLabel } from "@/lib/review/labels";
import { isMemorized } from "@/lib/review/learning";
import { continuation, reviewQueue, surahProgress } from "@/lib/store/selectors";
import type { Ayah, AyahStatus, SurahMeta, SurahText } from "@/lib/types";
import { SourceError, VerseSkeleton } from "./states";

type TabId = "read" | "memorize" | "tafsir" | "story" | "videos";

export function SurahScreen() {
  const params = useParams<{ surah: string }>();
  const n = Number(params?.surah);
  const meta = Number.isInteger(n) ? getSurahMeta(n) : undefined;
  if (!meta) {
    return (
      <Page narrow>
        <EmptyState
          icon="mushaf"
          title="لم نجد هذه السورة"
          body="رقم السورة يجب أن يكون بين ١ و١١٤."
          action={<ButtonLink href="/quran">تصفّح السور</ButtonLink>}
        />
      </Page>
    );
  }
  return <SurahView key={meta.number} meta={meta} />;
}

function SurahView({ meta }: { meta: SurahMeta }) {
  const n = meta.number;
  const { state } = useApp();
  const surah = useSurah(n);
  const stories = useMemo(() => storiesForSurah(n), [n]);
  const surahVideos = useMemo(() => videosForSurah(n), [n]);
  const [tab, setTab] = useState<TabId>("read");
  const [focusAyah, setFocusAyah] = useState<number | null>(null);
  const clearFocus = useCallback(() => setFocusAyah(null), []);

  const prog = surahProgress(state, n);
  const memorizedSet = useMemo(
    () => new Set(Object.values(state.progress).filter((p) => p.surah === n && isMemorized(p)).map((p) => p.ayah)),
    [state.progress, n],
  );
  const firstNew = useMemo(() => {
    let a = 1;
    while (a <= meta.ayahCount && memorizedSet.has(a)) a++;
    return Math.min(a, meta.ayahCount);
  }, [memorizedSet, meta.ayahCount]);
  // Where to continue is derived from what is memorized, not from a possibly stale stored pointer.
  const cont = continuation(state);
  const startAyah = cont.kind === "continue" && cont.surah === n ? cont.ayah : firstNew;

  const reciteHref = useMemo(() => {
    const due = reviewQueue(state).find((r) => r.surah === n && (r.bucket === "today" || r.bucket === "weak"));
    const ranges = memorizedRanges(Object.values(state.progress).filter((p) => p.surah === n));
    const r = due ?? ranges[ranges.length - 1];
    if (r) return `/recite?surah=${n}&from=${r.from}&to=${r.to}`;
    const target = state.profile?.dailyTargetAyahs ?? 5;
    return `/recite?surah=${n}&from=1&to=${Math.min(meta.ayahCount, target)}`;
  }, [state, n, meta.ayahCount]);

  // Deep link: #ayah-N → reading tab, then scroll once verses are on screen.
  useEffect(() => {
    const read = () => {
      const m = /^#ayah-(\d+)$/.exec(window.location.hash);
      if (m) {
        setTab("read");
        setFocusAyah(Number(m[1]));
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const tabs = [
    { value: "read" as const, label: "السورة", icon: "mushaf" as const },
    { value: "memorize" as const, label: "الحفظ", icon: "leaf" as const },
    { value: "tafsir" as const, label: "التفسير", icon: "book" as const },
    ...(stories.length ? [{ value: "story" as const, label: "القصة", icon: "scroll" as const }] : []),
    ...(surahVideos.length ? [{ value: "videos" as const, label: "الفيديوهات", icon: "video" as const }] : []),
  ];

  return (
    <Page narrow>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="relative mb-6 overflow-hidden rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25 px-5 py-6 sm:px-8 sm:py-8">
        <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.08]" />
        <div className="relative flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-olive font-medium">سورة رقم {toArabicDigits(n)}</p>
            <h1 className="mt-1 font-display text-5xl sm:text-6xl leading-tight text-forest">سورة {meta.nameAr}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
              <span>{ayahCountLabel(meta.ayahCount)}</span>
              <span aria-hidden className="size-1 rounded-full bg-sand" />
              <span>{revelationLabel(meta.revelation)}</span>
              <span aria-hidden className="size-1 rounded-full bg-sand" />
              <span lang="en" dir="ltr">
                {meta.nameEn}
              </span>
            </p>
          </div>
          <ProgressRing value={prog.ratio} size={76} stroke={6} label={`${percentLabel(prog.ratio)} من الحفظ — ${ayahCountLabel(prog.memorized)} محفوظة من ${toArabicDigits(meta.ayahCount)}`}>
            <span>
              <span className="block text-sm font-semibold text-forest num leading-tight">{percentLabel(prog.ratio)}</span>
              <span className="block text-[0.58rem] text-muted leading-tight">من الحفظ</span>
            </span>
          </ProgressRing>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2">
          {prog.complete ? null : (
            <ButtonLink href={`/memorize/${n}?from=${startAyah}`} icon="leaf" className="flex-1 sm:flex-none">
              احفظ
            </ButtonLink>
          )}
          <ButtonLink href={reciteHref} variant="secondary" icon="mic" className="flex-1 sm:flex-none">
            سمّع
          </ButtonLink>
          <p className="w-full sm:w-auto sm:ms-auto self-center text-xs text-muted">
            {prog.memorized
              ? `${prog.complete ? "أتممت حفظ السورة — " : ""}${toArabicDigits(prog.memorized)} من ${toArabicDigits(meta.ayahCount)} آية محفوظة${prog.weak ? ` · ${needsReviewLabel(prog.weak)}` : ""}`
              : "لم تبدأ حفظها بعد"}
          </p>
        </div>
      </header>

      <div className="sticky top-14 lg:top-0 z-20 bg-paper/92 backdrop-blur -mx-4 px-4 sm:mx-0 sm:px-0">
        <Tabs label={`أقسام سورة ${meta.nameAr}`} tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1} className="pt-6 focus:outline-none">
        {tab === "read" ? (
          <ReadingPanel meta={meta} surah={surah} focusAyah={focusAyah} onFocused={clearFocus} />
        ) : tab === "memorize" ? (
          <MemorizationPanel meta={meta} defaultStart={startAyah} />
        ) : tab === "tafsir" ? (
          <TafsirPanel meta={meta} surah={surah} />
        ) : tab === "story" ? (
          <div className="grid gap-4">
            {stories.map((s) => (
              <StoryCard key={s.slug} story={s} />
            ))}
          </div>
        ) : (
          <VideosPanel videos={surahVideos} />
        )}
      </div>
    </Page>
  );
}

type SurahState = ReturnType<typeof useSurah>;

// ── السورة ────────────────────────────────────────────────────────────────
function ReadingPanel({
  meta,
  surah,
  focusAyah,
  onFocused,
}: {
  meta: SurahMeta;
  surah: SurahState;
  focusAyah: number | null;
  onFocused: () => void;
}) {
  const { state, actions } = useApp();
  const ayahs = useMemo(() => surah.data?.ayahs ?? [], [surah.data]);
  const audio = useAyahAudio(ayahs);
  const [flashAyah, setFlashAyah] = useState<number | null>(null);
  const bookmarks = useMemo(() => new Set(state.bookmarks.map((b) => b.key)), [state.bookmarks]);
  const resumeCont = continuation(state);
  const resumeAyah = resumeCont.kind === "continue" && resumeCont.surah === meta.number ? resumeCont.ayah : null;

  useEffect(() => {
    if (!focusAyah || !ayahs.length) return;
    const el = document.getElementById(`ayah-${focusAyah}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }));
    setFlashAyah(focusAyah);
    onFocused();
  }, [focusAyah, ayahs.length, onFocused]);

  useEffect(() => {
    if (flashAyah == null) return;
    const t = setTimeout(() => setFlashAyah(null), 2400);
    return () => clearTimeout(t);
  }, [flashAyah]);

  // Stable handlers keep memoized AyahCards from re-rendering on every tick.
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const onPlay = useCallback(
    (a: Ayah) => {
      const au = audioRef.current;
      const i = ayahs.indexOf(a);
      if (au.current === i && au.playing) au.pause();
      else au.playOne(i);
    },
    [ayahs],
  );
  const onToggleBookmark = useCallback((a: Ayah) => actions.toggleBookmark(a.key), [actions]);
  // Marking a single ayah while reading must not move the learner's resume
  // point (markMemorized advances it), unless it is exactly the resume ayah.
  const resumeRef = useRef(state.resume);
  resumeRef.current = state.resume;
  const onMarkMemorized = useCallback(
    (a: Ayah) => {
      const prev = resumeRef.current;
      actions.markMemorized({ surah: a.surah, from: a.ayah, to: a.ayah });
      if (prev && !(prev.surah === a.surah && prev.ayah === a.ayah)) {
        actions.setResume({ surah: prev.surah, ayah: prev.ayah, mode: prev.mode });
      }
    },
    [actions],
  );
  const onAddToReview = useCallback((a: Ayah) => actions.addToReview(a.key), [actions]);

  if (surah.loading && !surah.data) return <VerseSkeleton />;
  if (surah.error || !surah.data) return <SourceError onRetry={surah.retry} />;

  return (
    <div>
      <ol className="space-y-1">
        {ayahs.map((a, i) => (
          <li key={a.key} className={cn("rounded-2xl transition-[box-shadow] duration-700", flashAyah === a.ayah && "ring-2 ring-sand/60")}>
            <AyahCard
              ayah={a}
              status={state.progress[a.key]?.status}
              bookmarked={bookmarks.has(a.key)}
              playing={audio.current === i && audio.playing}
              resumeHere={resumeAyah === a.ayah && a.ayah > 1}
              onPlay={onPlay}
              onToggleBookmark={onToggleBookmark}
              onMarkMemorized={onMarkMemorized}
              onAddToReview={onAddToReview}
            />
          </li>
        ))}
      </ol>
      <div className="mt-6 flex justify-center">
        <SourceLine title={surah.data.source.title} url={surah.data.source.url} />
      </div>
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4 z-10 mt-6">
        <AudioPlayer audio={audio} ayahs={ayahs} title={`الاستماع لسورة ${meta.nameAr}`} className="shadow-[var(--shadow-lift)]" />
      </div>
    </div>
  );
}

// ── الحفظ ─────────────────────────────────────────────────────────────────
const HEAT: { status: AyahStatus; label: string }[] = [
  { status: "new", label: "جديدة" },
  { status: "memorized", label: "محفوظة" },
  { status: "weak", label: "تحتاج مراجعة" },
  { status: "mastered", label: "متقنة" },
];

function MemorizationPanel({ meta, defaultStart }: { meta: SurahMeta; defaultStart: number }) {
  const { state } = useApp();
  const [start, setStart] = useState(defaultStart);
  const statuses = useMemo(
    () =>
      Array.from({ length: meta.ayahCount }, (_, i) => {
        const s = state.progress[`${meta.number}:${i + 1}`]?.status ?? "new";
        return s === "learning" ? "new" : s;
      }),
    [state.progress, meta],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of statuses) c[s] = (c[s] ?? 0) + 1;
    return c;
  }, [statuses]);
  const clamp = (v: number) => Math.min(meta.ayahCount, Math.max(1, v));

  return (
    <div className="space-y-6">
      <section aria-labelledby="heat-title" className="rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line p-5">
        <h2 id="heat-title" className="text-base font-semibold text-forest">
          خريطة حفظ السورة
        </h2>
        <p className="mt-1 text-sm text-muted">
          كل مربع آية؛ اضغط مربعًا لتختار نقطة البدء.
        </p>
        <div
          className="mt-4 flex flex-wrap gap-1"
          role="group"
          aria-label={`حالة آيات سورة ${meta.nameAr}: ${HEAT.map((h) => `${h.label} ${toArabicDigits(counts[h.status] ?? 0)}`).join("، ")}`}
        >
          {statuses.map((s, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-hidden
              title={`الآية ${toArabicDigits(i + 1)} — ${STATUS_META[s].label}`}
              onClick={() => setStart(i + 1)}
              className={cn(
                "size-4 sm:size-[1.15rem] rounded-[0.3rem] transition-transform motion-safe:hover:scale-125",
                STATUS_META[s].swatch,
                start === i + 1 && "outline-2 outline-offset-1 outline-forest",
              )}
            />
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="مفتاح الألوان">
          {HEAT.map((h) => (
            <li key={h.status} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-3 rounded-[0.25rem]", STATUS_META[h.status].swatch)} />
              {h.label}
              <span className="num text-ink/70">{toArabicDigits(counts[h.status] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="نقطة البدء" className="rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <IconButton icon="plus" label="الآية التالية" onClick={() => setStart((v) => clamp(v + 1))} className="bg-white ring-1 ring-line" />
          <label className="sr-only" htmlFor="start-ayah">
            رقم آية البدء
          </label>
          <input
            id="start-ayah"
            type="number"
            inputMode="numeric"
            min={1}
            max={meta.ayahCount}
            value={start}
            onChange={(e) => setStart(clamp(Number(e.target.value) || 1))}
            className="w-20 h-11 rounded-xl bg-white ring-1 ring-inset ring-line text-center text-lg font-semibold text-forest num focus:outline-none focus:ring-2 focus:ring-olive"
          />
          <IconButton icon="minus" label="الآية السابقة" onClick={() => setStart((v) => clamp(v - 1))} className="bg-white ring-1 ring-line" />
        </div>
        <p className="text-sm text-muted flex-1">
          {STATUS_META[statuses[start - 1] ?? "new"].label} ·{" "}
          {start === defaultStart ? "موضعك الحالي" : `من ${toArabicDigits(meta.ayahCount)}`}
        </p>
        <ButtonLink href={`/memorize/${meta.number}?from=${start}`} iconEnd="forward">
          ابدأ من الآية {toArabicDigits(start)}
        </ButtonLink>
      </section>
    </div>
  );
}

// ── التفسير ───────────────────────────────────────────────────────────────
function TafsirPanel({ meta, surah }: { meta: SurahMeta; surah: SurahState }) {
  const tafsir = useTafsir(meta.number, true);
  if (surah.loading && !surah.data) return <VerseSkeleton lines={4} />;
  if (surah.error || !surah.data) return <SourceError onRetry={surah.retry} />;
  const data: SurahText = surah.data;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-parchment/70 px-4 py-3">
        <p className="text-sm text-ink/80">
          <Icon name="book" size={16} className="inline align-[-3px] me-1.5 text-olive" />
          المعاني من <strong className="font-semibold text-forest">{tafsir.data?.source.title ?? "التفسير الميسر"}</strong> كما نُشر، دون تعديل.
        </p>
        {tafsir.data ? <SourceLine title={tafsir.data.source.title} url={tafsir.data.source.url} /> : null}
      </div>
      {tafsir.error ? (
        <ErrorState title="تعذّر تحميل التفسير من المصدر" body="تحقّق من اتصالك ثم أعد المحاولة." onRetry={tafsir.retry} />
      ) : (
        <ol className="space-y-6">
          {data.ayahs.map((a) => (
            <li key={a.key} id={`tafsir-${a.ayah}`} className="border-b hairline pb-6 last:border-0">
              <QuranVerse ayah={a} />
              <TafsirNote
                className="mt-2"
                entry={tafsir.data?.byKey.get(a.key) ?? null}
                loading={tafsir.loading}
                label={`التفسير — الآية ${toArabicDigits(a.ayah)}`}
                showSource={false}
              />
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6 flex flex-col items-center gap-1">
        <SourceLine title={data.source.title} url={data.source.url} />
        {tafsir.data ? <SourceLine title={tafsir.data.source.title} url={tafsir.data.source.url} /> : null}
      </div>
    </div>
  );
}

// ── الفيديوهات ────────────────────────────────────────────────────────────
function VideosPanel({ videos }: { videos: CuratedVideo[] }) {
  const [activeId, setActiveId] = useState(videos[0]?.id);
  const active = videos.find((v) => v.id === activeId) ?? videos[0];
  return (
    <div className="space-y-5">
      {active ? (
        <div>
          <YouTubeEmbed key={active.id} youtubeId={active.youtubeId} title={active.title} thumbnail={active.thumbnail} autoLoad={activeId !== videos[0]?.id} />
          <p className="mt-3 font-semibold text-forest">{active.title}</p>
          <p className="text-xs text-muted">{active.channel}</p>
        </div>
      ) : null}
      {videos.length > 1 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <li key={v.id}>
              <VideoCard video={v} active={v.id === active?.id} onSelect={setActiveId} layout="row" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
