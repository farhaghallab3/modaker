"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { VideoCard } from "@/components/stories/VideoCard";
import { YouTubeEmbed } from "@/components/stories/YouTubeEmbed";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { getStory, visibleStories } from "@/content/stories";
import { visibleVideos } from "@/content/videos";
import { needsDemoNotice } from "@/lib/content-state";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { FilterChips } from "@/features/shared/FilterChips";

const VIDEOS = visibleVideos();
const STORIES = visibleStories();
const SURAHS_WITH_VIDEOS = [...new Set(VIDEOS.map((v) => v.surah).filter((n): n is number => !!n))].sort((a, b) => a - b);

/** Filters and the selected video live in the URL (?surah=&story=&v=) so links are shareable. */
export function VideoLibraryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/videos";
  const playerRef = useRef<HTMLDivElement>(null);

  const surah = params.get("surah") ? Number(params.get("surah")) : null;
  const story = params.get("story");
  const selectedId = params.get("v");

  function setParams(next: Record<string, string | number | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, String(v));
    }
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const filtered = useMemo(
    () => VIDEOS.filter((v) => (surah == null || v.surah === surah) && (!story || v.storySlug === story)),
    [surah, story],
  );
  const selected = VIDEOS.find((v) => v.id === selectedId) ?? filtered[0] ?? null;
  const storiesForFilter = STORIES.filter(
    (s) => VIDEOS.some((v) => v.storySlug === s.slug) && (surah == null || s.surahs.includes(surah)),
  );
  const selectedStory = selected?.storySlug ? getStory(selected.storySlug) : undefined;
  const selectedSurah = selected?.surah ? getSurahMeta(selected.surah) : undefined;

  function play(id: string) {
    setParams({ v: id });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    playerRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <Page>
      <PageHeader
        eyebrow="افهم"
        title="المرئيات"
        description="مقاطع مختارة بعناية مرتبطة بالسور والقصص التي تحفظها، تُعرض بوضع الخصوصية المحسّن."
      />

      {/* ── Player ──────────────────────────────────────────────────── */}
      {selected ? (
        <section ref={playerRef} aria-label="المقطع المختار" className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start scroll-mt-20">
          <YouTubeEmbed youtubeId={selected.youtubeId} title={selected.title} thumbnail={selected.thumbnail} />
          <div className="lg:pt-2">
            <div className="flex flex-wrap gap-2">
              {selectedSurah ? <Badge>سورة {selectedSurah.nameAr}</Badge> : null}
            </div>
            <h2 className="mt-3 font-display text-2xl sm:text-3xl leading-snug text-forest">{selected.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {selected.channel}
              {selected.durationLabel ? ` · ${selected.durationLabel}` : ""}
            </p>
            <p className="mt-4 leading-8 text-ink/80">{selected.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedStory ? (
                <Link
                  href={`/stories/${selectedStory.slug}`}
                  className="inline-flex items-center gap-1.5 h-9 rounded-xl px-3.5 text-sm bg-olive-100 text-forest hover:bg-sage"
                >
                  <Icon name="scroll" size={16} />
                  {selectedStory.title}
                </Link>
              ) : null}
              {selected.range ? (
                <Link
                  href={`/quran/${selected.range.surah}#ayah-${selected.range.from}`}
                  className="inline-flex items-center gap-1.5 h-9 rounded-xl px-3.5 text-sm ring-1 ring-inset ring-line text-forest hover:bg-parchment"
                >
                  <Icon name="mushaf" size={16} />
                  الآيات {toArabicDigits(selected.range.from)}–{toArabicDigits(selected.range.to)}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="space-y-3 mb-8 border-t hairline pt-8">
        <FilterChips
          label="تصفية حسب السورة"
          value={surah}
          onChange={(v) => setParams({ surah: v, story: null, v: null })}
          options={[{ value: null, label: "كل السور" }, ...SURAHS_WITH_VIDEOS.map((n) => ({ value: n, label: `سورة ${getSurahMeta(n)?.nameAr}` }))]}
        />
        {storiesForFilter.length ? (
          <FilterChips
            label="تصفية حسب القصة"
            value={story}
            onChange={(v) => setParams({ story: v, v: null })}
            options={[{ value: null, label: "كل القصص" }, ...storiesForFilter.map((s) => ({ value: s.slug, label: s.title }))]}
          />
        ) : null}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {filtered.length ? (
        <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <li key={v.id}>
              <VideoCard video={v} active={v.id === selected?.id} onSelect={play} />
            </li>
          ))}
          <li>
            <ComingSoonCard />
          </li>
        </ul>
      ) : (
        <EmptyState
          icon="video"
          title={VIDEOS.length ? "لا مقاطع بهذا التصنيف بعد" : "المقاطع قيد المراجعة"}
          body={VIDEOS.length ? "يضيف فريق المحتوى المقاطع بعد مراجعتها. جرّب تصنيفًا آخر." : "يضيف فريق المحتوى المقاطع بعد مراجعتها."}
          action={
            <Button variant="ghost" size="sm" onClick={() => setParams({ surah: null, story: null, v: null })}>
              عرض كل المقاطع
            </Button>
          }
        />
      )}
    </Page>
  );
}

/** Closing tile of the grid: tells learners the library keeps growing. Not a video. */
function ComingSoonCard() {
  return (
    <div className="block">
      <span aria-hidden className="relative block aspect-video w-full overflow-hidden rounded-2xl bg-forest">
        <span className="pattern-girih absolute inset-0 opacity-[0.12]" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-11 place-items-center rounded-full bg-cream/15 text-cream ring-1 ring-inset ring-cream/25">
            <Icon name="plus" size={18} />
          </span>
        </span>
      </span>
      <p className="mt-3 font-medium leading-6 text-forest">مزيد من المقاطع قريبًا</p>
      <p className="mt-1 text-xs leading-5 text-muted">نضيف مقاطع جديدة بعد مراجعتها، فعُد إلينا بين حين وآخر.</p>
    </div>
  );
}
