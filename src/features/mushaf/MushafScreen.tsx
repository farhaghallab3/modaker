"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AudioPlayer } from "@/components/quran/AudioPlayer";
import { MushafPageView, loadQcfFont } from "@/components/quran/MushafPageView";
import { useAyahAudio } from "@/components/quran/useAyahAudio";
import { Icon } from "@/components/ui/Icon";
import { cn, IconButton } from "@/components/ui/primitives";
import { api, useAsync } from "@/lib/api";
import { MUSHAF_PAGES, isValidPage, pageForSurah, type MushafWord } from "@/lib/quran/mushaf";
import { SURAHS, getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { Ayah } from "@/lib/types";
import { SourceError, VerseSkeleton } from "@/features/quran/states";

const LAST_PAGE_KEY = "muzakkir:mushaf-page";

export function rememberedMushafPage(): number {
  try {
    const n = Number(window.localStorage.getItem(LAST_PAGE_KEY));
    return isValidPage(n) ? n : 1;
  } catch {
    return 1;
  }
}

/** The Madinah Mushaf, page by page (1–604), with recitation in the learner's chosen reciter. */
export function MushafScreen({ page }: { page: number }) {
  const router = useRouter();
  const { data, error, loading, retry } = useAsync(() => api.mushafPage(page), [page]);
  const [selected, setSelected] = useState<MushafWord | null>(null);

  const go = (n: number) => {
    if (isValidPage(n) && n !== page) router.push(`/mushaf/${n}`);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_PAGE_KEY, String(page));
    } catch {
      /* not remembered — fine */
    }
    setSelected(null);
  }, [page]);

  // Reading direction of the Mushaf: the next page is to the left.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
      if (e.key === "ArrowLeft") go(page + 1);
      if (e.key === "ArrowRight") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Warm the next page (data + font) so turning the page feels instant.
  useEffect(() => {
    if (!data || page >= MUSHAF_PAGES) return;
    api
      .mushafPage(page + 1)
      .then((next) => loadQcfFont(next.page, next.fontUrl))
      .catch(() => {});
  }, [data, page]);

  // The page's ayahs, in order, for recitation.
  const ayahs = useMemo<Ayah[]>(() => {
    if (!data) return [];
    const seen = new Map<string, Ayah>();
    for (const line of data.lines) {
      if (line.kind !== "words") continue;
      for (const w of line.words) {
        const key = `${w.surah}:${w.ayah}`;
        const a = seen.get(key) ?? { surah: w.surah, ayah: w.ayah, key, textUthmani: "" };
        if (w.type === "word") a.textUthmani = a.textUthmani ? `${a.textUthmani} ${w.text}` : w.text;
        seen.set(key, a);
      }
    }
    return [...seen.values()];
  }, [data]);
  const audio = useAyahAudio(ayahs);
  const activeAyah = audio.current != null ? ayahs[audio.current]?.key : null;

  const surahs = data?.surahs ?? [];
  const title = surahs.map((s) => `سورة ${getSurahMeta(s)?.nameAr}`).join(" · ");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">المصحف الشريف · مصحف المدينة النبوية</p>
          <h1 className="mt-1 truncate font-display text-2xl text-forest sm:text-3xl">{title || "المصحف"}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          {data ? <span>الجزء {toArabicDigits(data.juz)}</span> : null}
          <span aria-hidden>·</span>
          <span>الصفحة {toArabicDigits(page)}</span>
        </div>
      </header>

      <Navigator page={page} onGo={go} />

      {/* ── The page ───────────────────────────────────────────────── */}
      <section
        aria-label={`الصفحة ${page}`}
        className="mt-4 rounded-[var(--radius-card)] bg-[#fffdf6] px-3 py-5 shadow-[var(--shadow-soft)] ring-1 ring-sand/30 dark:bg-white sm:px-6 sm:py-7"
      >
        {error ? (
          <SourceError onRetry={retry} />
        ) : loading || !data ? (
          <VerseSkeleton lines={15} />
        ) : (
          <MushafPageView page={data} activeAyah={activeAyah} selected={selected?.id ?? null} onWord={setSelected} />
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <PageTurn dir="next" page={page} onGo={go} />
          <span className="num">{toArabicDigits(page)}</span>
          <PageTurn dir="prev" page={page} onGo={go} />
        </div>
      </section>

      {selected && data ? (
        <WordPanel
          word={selected}
          onClose={() => setSelected(null)}
          onListen={() => {
            const i = ayahs.findIndex((a) => a.surah === selected.surah && a.ayah === selected.ayah);
            if (i >= 0) audio.playAll(i);
          }}
        />
      ) : null}

      <div className="sticky bottom-20 z-20 mt-4 lg:bottom-4">
        <AudioPlayer audio={audio} ayahs={ayahs} title={`الاستماع للصفحة ${toArabicDigits(page)}`} className="shadow-[var(--shadow-lift)]" />
      </div>

      {data ? (
        <p className="mt-4 text-center text-[0.7rem] text-muted">
          الخط: خطوط مجمع الملك فهد لطباعة المصحف الشريف · النص والتخطيط عبر{" "}
          <a href={data.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-forest">
            Quran.com
          </a>{" "}
          · مُطابَق آيةً آية مع النص الموثّق
        </p>
      ) : null}
    </div>
  );
}

function PageTurn({ dir, page, onGo }: { dir: "next" | "prev"; page: number; onGo: (n: number) => void }) {
  const target = dir === "next" ? page + 1 : page - 1;
  const disabled = !isValidPage(target);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onGo(target)}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-forest transition-colors hover:bg-parchment disabled:opacity-30"
    >
      {dir === "prev" ? (
        <>
          الصفحة السابقة
          <Icon name="forward" size={16} />
        </>
      ) : (
        <>
          <Icon name="back" size={16} />
          الصفحة التالية
        </>
      )}
    </button>
  );
}

/** Jump by surah or page number. */
function Navigator({ page, onGo }: { page: number; onGo: (n: number) => void }) {
  const [value, setValue] = useState(String(page));
  useEffect(() => setValue(String(page)), [page]);
  const field = "h-10 rounded-xl bg-white px-3 text-sm text-forest ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-olive";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="mushaf-surah">
        اذهب إلى سورة
      </label>
      <select
        id="mushaf-surah"
        className={cn(field, "min-w-0 flex-1")}
        value=""
        onChange={(e) => e.target.value && onGo(pageForSurah(Number(e.target.value)))}
      >
        <option value="">اذهب إلى سورة…</option>
        {SURAHS.map((s) => (
          <option key={s.number} value={s.number}>
            {toArabicDigits(s.number)}. {s.nameAr} — ص {toArabicDigits(pageForSurah(s.number))}
          </option>
        ))}
      </select>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onGo(Number(value));
        }}
      >
        <label className="sr-only" htmlFor="mushaf-page">
          رقم الصفحة
        </label>
        <input
          id="mushaf-page"
          type="number"
          inputMode="numeric"
          min={1}
          max={MUSHAF_PAGES}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={cn(field, "w-24 text-center num")}
        />
        <button type="submit" className="h-10 rounded-xl bg-forest px-4 text-sm text-cream hover:bg-forest-700 dark:bg-olive">
          اذهب
        </button>
      </form>
    </div>
  );
}

/** What was tapped: the word, where it is, and what you can do with it. */
function WordPanel({ word, onClose, onListen }: { word: MushafWord; onClose: () => void; onListen: () => void }) {
  const meta = getSurahMeta(word.surah);
  return (
    <aside
      role="dialog"
      aria-label="تفاصيل الكلمة"
      className="mt-4 rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line shadow-[var(--shadow-soft)] animate-rise"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {word.type === "word" ? <p className="quran-text text-3xl leading-relaxed text-forest">{word.text}</p> : null}
          <p className="mt-1 text-sm text-muted">
            سورة {meta?.nameAr} · الآية {toArabicDigits(word.ayah)}
            {word.type === "word" ? <> · الكلمة {toArabicDigits(word.position)}</> : null}
          </p>
        </div>
        <IconButton icon="x" label="إغلاق" onClick={onClose} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onListen} className="inline-flex h-10 items-center gap-2 rounded-xl bg-forest px-4 text-sm text-cream hover:bg-forest-700 dark:bg-olive">
          <Icon name="play" size={15} />
          استمع من هذه الآية
        </button>
        <Link
          href={`/quran/${word.surah}#ayah-${word.ayah}`}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm text-forest ring-1 ring-inset ring-line hover:bg-parchment"
        >
          <Icon name="lamp" size={15} />
          المعنى والتفسير
        </Link>
      </div>
    </aside>
  );
}
