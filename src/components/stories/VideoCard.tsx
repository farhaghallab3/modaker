"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge, cn } from "@/components/ui/primitives";
import { videoThumbnail, type CuratedVideo } from "@/content/videos";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";

/**
 * Compact video tile. Pass `onSelect` to make it a button (library / story pages
 * with an inline player), or `href` to make it a link.
 */
export function VideoCard({
  video,
  active = false,
  onSelect,
  href,
  layout = "stacked",
}: {
  video: CuratedVideo;
  active?: boolean;
  onSelect?: (id: string) => void;
  href?: string;
  /** "row" puts the thumbnail beside the text — used in side lists. */
  layout?: "stacked" | "row";
}) {
  const thumb = videoThumbnail(video);
  const meta = video.surah ? getSurahMeta(video.surah) : undefined;
  const rangeLabel =
    video.range && meta
      ? `سورة ${meta.nameAr} · ${toArabicDigits(video.range.from)}–${toArabicDigits(video.range.to)}`
      : meta
        ? `سورة ${meta.nameAr}`
        : null;

  const body = (
    <>
      <span
        className={cn(
          "relative block overflow-hidden rounded-2xl bg-forest aspect-video",
          layout === "row" ? "w-32 sm:w-36 shrink-0" : "w-full",
        )}
        aria-hidden
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="pattern-girih absolute inset-0 opacity-[0.12]" />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span
            className={cn(
              "grid place-items-center rounded-full transition-colors",
              layout === "row" ? "size-8" : "size-11",
              active ? "bg-sand text-forest" : "bg-cream/90 text-forest",
            )}
          >
            <Icon name={active ? "volume" : "play"} size={layout === "row" ? 14 : 18} />
          </span>
        </span>
        {video.durationLabel ? (
          <span className="absolute bottom-2 end-2 rounded-md bg-scrim/70 px-1.5 py-0.5 text-[0.65rem] text-cream">{video.durationLabel}</span>
        ) : null}
      </span>
      <span className={cn("min-w-0 block", layout === "row" ? "flex-1" : "mt-3")}>
        <span className={cn("block font-medium leading-6 line-clamp-2", active ? "text-forest" : "text-ink")}>{video.title}</span>
        <span className="mt-1 block text-xs text-muted truncate">{video.channel}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {rangeLabel ? <span className="text-[0.7rem] text-olive">{rangeLabel}</span> : null}
          {active ? <Badge tone="forest">يُعرض الآن</Badge> : null}
          {!video.youtubeId ? <Badge tone="muted">قريبًا</Badge> : null}
        </span>
      </span>
    </>
  );

  const cls = cn(
    "group w-full text-start rounded-[var(--radius-card)] p-2 -m-2 transition-colors hover:bg-parchment/70",
    layout === "row" ? "flex items-start gap-3" : "block",
    active && "bg-parchment",
  );

  if (onSelect) {
    return (
      <button type="button" className={cls} onClick={() => onSelect(video.id)} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href ?? `/videos?v=${video.id}`} className={cls}>
      {body}
    </Link>
  );
}
