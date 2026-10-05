"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Page } from "@/components/layout/PageHeader";
import { chapterNumber, rangeLabel, StoryTimeline } from "@/components/stories/StoryTimeline";
import { VideoCard } from "@/components/stories/VideoCard";
import { YouTubeEmbed } from "@/components/stories/YouTubeEmbed";
import { Icon } from "@/components/ui/Icon";
import { Button, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { SourceList } from "@/components/ui/SourceCitation";
import { getStory } from "@/content/stories";
import { DEMO_CONTENT_LABEL, needsDemoNotice } from "@/lib/content-state";
import { videosForStory } from "@/content/videos";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { ChapterVerses } from "./ChapterVerses";

export function StoryDetailScreen() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const story = slug ? getStory(slug) : undefined;
  const [current, setCurrent] = useState(story?.chapters[0]?.id ?? "");
  const videos = story ? videosForStory(story.slug) : [];
  const [videoId, setVideoId] = useState(videos[0]?.id ?? null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (!story) {
    return (
      <Page narrow>
        <EmptyState
          icon="scroll"
          title="لم نجد هذه القصة"
          body="ربما تغيّر الرابط. تصفّح القصص المتاحة."
          action={<ButtonLink href="/stories">قصص القرآن</ButtonLink>}
        />
      </Page>
    );
  }

  const index = Math.max(
    0,
    story.chapters.findIndex((c) => c.id === current),
  );
  const chapter = story.chapters[index];
  const prev = story.chapters[index - 1];
  const next = story.chapters[index + 1];
  const video = videos.find((v) => v.id === videoId) ?? videos[0];

  function select(id: string, moveFocus = false) {
    setCurrent(id);
    // On small screens the chapter sits below the timeline: bring it into view.
    if (moveFocus || (typeof window !== "undefined" && window.innerWidth < 1024)) {
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  }

  return (
    <Page>
      <Link href="/stories" className="inline-flex items-center gap-1 text-sm text-muted hover:text-forest mb-6">
        <Icon name="back" size={16} />
        قصص القرآن
      </Link>

      {/* ── Story header ──────────────────────────────────────────── */}
      <header className="relative mb-8 max-w-3xl">
        <h1 className="font-display text-4xl sm:text-5xl leading-tight text-forest">{story.title}</h1>
        <p className="mt-2 text-lg text-olive">{story.subtitle}</p>
        <p className="mt-5 leading-8 text-ink/80">{story.intro}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">في المصحف:</span>
          {story.surahs.map((n) => (
            <Link
              key={n}
              href={`/quran/${n}`}
              className="inline-flex items-center gap-1.5 h-8 rounded-full bg-olive-100 px-3 text-forest hover:bg-sage"
            >
              <Icon name="mushaf" size={14} />
              سورة {getSurahMeta(n)?.nameAr}
            </Link>
          ))}
          <span className="text-muted">· {toArabicDigits(story.chapters.length)} فصول</span>
        </div>
      </header>

      {needsDemoNotice(story) ? (
        <p role="note" className="mb-10 flex items-start gap-2.5 rounded-2xl bg-sand-100/70 px-4 py-3 text-sm leading-6 text-sand-800">
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">{DEMO_CONTENT_LABEL}.</strong> المقدمة وملخصات الفصول ليست تفسيرًا؛ نص الآيات من
            المصحف الموثّق والتفسير من التفسير الميسر.
          </span>
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14">
        {/* ── Timeline ──────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-xs font-medium text-muted mb-3">الفصول</p>
          <StoryTimeline chapters={story.chapters} current={chapter.id} onSelect={(id) => select(id)} />
        </aside>

        {/* ── Current chapter ───────────────────────────────────────── */}
        <article aria-labelledby="chapter-title" className="min-w-0">
          <p className="text-sm text-olive font-medium">
            الفصل <span className="num">{chapterNumber(chapter.order)}</span> · الآيات {rangeLabel(chapter)}
          </p>
          <h2
            id="chapter-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 font-display text-3xl sm:text-4xl text-forest scroll-mt-20 focus:outline-none"
          >
            {chapter.title}
          </h2>
          <div className="mt-4 mb-8 max-w-2xl">
            <p className="text-[0.7rem] font-medium text-muted mb-1">تمهيد تحريري</p>
            <p className="leading-8 text-ink/80">{chapter.summary}</p>
          </div>

          <div className="space-y-10">
            {chapter.ranges.map((r) => (
              <ChapterVerses key={`${chapter.id}-${r.surah}-${r.from}`} range={r} />
            ))}
          </div>

          <nav aria-label="التنقل بين الفصول" className="mt-10 flex items-center justify-between gap-3 border-t hairline pt-6">
            {prev ? (
              <Button variant="quiet" icon="back" onClick={() => select(prev.id, true)}>
                <span className="sr-only">الفصل السابق: </span>
                {prev.title}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="secondary" iconEnd="forward" onClick={() => select(next.id, true)}>
                <span className="sr-only">الفصل التالي: </span>
                {next.title}
              </Button>
            ) : (
              <p className="text-sm text-muted">انتهت القصة — بارك الله في وقتك.</p>
            )}
          </nav>
        </article>
      </div>

      {/* ── Related videos ──────────────────────────────────────────── */}
      {video ? (
        <section aria-labelledby="story-videos" className="mt-16 border-t hairline pt-10">
          <h2 id="story-videos" className="font-display text-2xl text-forest mb-5">
            مرئيات مرتبطة
          </h2>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <YouTubeEmbed youtubeId={video.youtubeId} title={video.title} thumbnail={video.thumbnail} />
              <p className="mt-3 font-medium text-forest">{video.title}</p>
              <p className="text-sm text-muted leading-7">{video.description}</p>
            </div>
            {videos.length > 1 ? (
              <ul className="space-y-4">
                {videos.map((v) => (
                  <li key={v.id}>
                    <VideoCard video={v} layout="row" active={v.id === video.id} onSelect={setVideoId} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted leading-7">
                <Link href={`/videos?story=${story.slug}`} className="text-olive underline underline-offset-4 hover:text-forest">
                  تصفّح مكتبة المرئيات
                </Link>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* ── References ──────────────────────────────────────────────── */}
      <section aria-labelledby="story-refs" className="mt-16 border-t hairline pt-8 max-w-2xl">
        <h2 id="story-refs" className="font-display text-2xl text-forest mb-2">
          المراجع
        </h2>
        <SourceList items={story.references} title="" compact />
      </section>
    </Page>
  );
}
