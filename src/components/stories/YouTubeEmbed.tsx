"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/components/ui/primitives";
import { isValidYouTubeId } from "@/content/videos";

/**
 * Privacy-enhanced YouTube player.
 * - Click-to-load facade: nothing is requested from YouTube until the learner presses play
 *   (the thumbnail comes from i.ytimg.com and is lazy-loaded).
 * - Embeds via youtube-nocookie.com, 16:9 responsive, with a descriptive `title`.
 * - When `youtubeId` is null/invalid, shows a calm "pending" placeholder instead.
 */
export function YouTubeEmbed({
  youtubeId,
  title,
  thumbnail,
  className,
  autoLoad = false,
}: {
  youtubeId: string | null;
  title: string;
  thumbnail?: string;
  className?: string;
  /** Skip the facade (e.g. the learner already chose this video from a list). */
  autoLoad?: boolean;
}) {
  const valid = isValidYouTubeId(youtubeId);
  const [active, setActive] = useState(autoLoad);

  // A different video resets the facade.
  useEffect(() => setActive(autoLoad), [youtubeId, autoLoad]);

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-[var(--radius-card)] bg-forest", className)}>
      {!valid ? (
        <PendingVideo title={title} />
      ) : active ? (
        <iframe
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&hl=ar&cc_lang_pref=ar`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="group absolute inset-0 size-full text-start"
          aria-label={`تشغيل: ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail ?? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-scrim/70 via-scrim/10 to-transparent" aria-hidden />
          <span className="absolute inset-0 grid place-items-center" aria-hidden>
            <span className="grid place-items-center size-16 sm:size-18 rounded-full bg-cream/95 text-forest shadow-[var(--shadow-lift)] transition-transform group-hover:scale-105">
              <Icon name="play" size={26} className="translate-x-0.5" /* optical centering; the play glyph never mirrors */ />
            </span>
          </span>
          <span className="absolute bottom-0 inset-x-0 p-4 sm:p-5 text-cream">
            <span className="block text-sm sm:text-base font-medium line-clamp-2">{title}</span>
            <span className="mt-1 block text-[0.7rem] text-cream/70">يُحمَّل المقطع من يوتيوب بوضع الخصوصية المحسّن عند التشغيل</span>
          </span>
        </button>
      )}
    </div>
  );
}

function PendingVideo({ title }: { title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-center bg-forest text-cream" role="img" aria-label={`${title} — المقطع لم يُضف بعد`}>
      <div className="pattern-girih absolute inset-0 opacity-[0.12]" aria-hidden />
      <div className="relative px-6">
        <span className="mx-auto grid place-items-center size-14 rounded-full ring-1 ring-cream/25 text-sand">
          <Icon name="video" size={24} />
        </span>
        <p className="mt-4 font-display text-xl sm:text-2xl leading-snug">{title}</p>
        <p className="mt-2 text-sm text-cream/70">بانتظار إضافة المقطع من فريق المحتوى</p>
      </div>
    </div>
  );
}
