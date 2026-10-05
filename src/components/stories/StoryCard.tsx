import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { storySpan } from "@/content/stories";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { Story } from "@/lib/types";

const ACCENT_DOT: Record<Story["accent"], string> = {
  olive: "bg-olive",
  forest: "bg-forest",
  sand: "bg-sand",
  terracotta: "bg-terracotta",
};

function spanLabel(story: Story) {
  const span = storySpan(story);
  const meta = getSurahMeta(span.surah);
  return `سورة ${meta?.nameAr ?? ""} · الآيات ${toArabicDigits(span.from)}–${toArabicDigits(span.to)}`;
}

/** Story entry in the index. `featured` renders the large hero variant. */
export function StoryCard({ story, featured = false }: { story: Story; featured?: boolean }) {
  const chapters = toArabicDigits(story.chapters.length);

  if (featured) {
    return (
      <Link
        href={`/stories/${story.slug}`}
        className="group relative block overflow-hidden rounded-[2rem] bg-forest text-cream p-7 sm:p-10 lg:p-12 shadow-[var(--shadow-lift)]"
      >
        <span className="pattern-girih absolute inset-0 opacity-[0.1]" aria-hidden />
        <span
          className="absolute -top-24 -end-24 size-72 rounded-full bg-olive/40 blur-3xl transition-opacity group-hover:opacity-80"
          aria-hidden
        />
        <span className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <span className="block max-w-2xl">
            <span className="inline-flex items-center gap-2 text-sm text-sand">
              <Icon name="scroll" size={16} />
              القصة المختارة
            </span>
            <span className="mt-3 block font-display text-4xl sm:text-5xl leading-tight">{story.title}</span>
            <span className="mt-2 block text-cream/80 text-lg">{story.subtitle}</span>
            <span className="mt-5 block text-cream/75 leading-8 line-clamp-3 sm:line-clamp-none">{story.intro}</span>
          </span>
          <span className="flex flex-col gap-4 lg:items-end">
            <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-cream/70">
              <span>{chapters} فصول</span>
              <span>{spanLabel(story)}</span>
            </span>
            <span className="inline-flex items-center gap-2 self-start lg:self-end h-11 px-5 rounded-2xl bg-cream text-forest font-medium transition-colors group-hover:bg-white">
              ابدأ القصة
              <Icon name="arrowForward" size={18} />
            </span>
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/stories/${story.slug}`}
      className="group flex h-full flex-col rounded-[var(--radius-card)] bg-white/60 ring-1 ring-line p-6 transition-[box-shadow,background-color] hover:bg-white hover:shadow-[var(--shadow-soft)]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          <span className={cn("size-2 rounded-full", ACCENT_DOT[story.accent])} aria-hidden />
          {spanLabel(story)}
        </span>
        {story.contentStatus === "demo" ? <Badge tone="muted">تجريبي</Badge> : null}
      </span>
      <span className="mt-5 block font-display text-2xl text-forest leading-snug">{story.title}</span>
      <span className="mt-1 block text-sm text-olive">{story.subtitle}</span>
      <span className="mt-3 block flex-1 text-sm leading-7 text-muted line-clamp-3">{story.intro}</span>
      <span className="mt-5 flex items-center justify-between border-t hairline pt-4 text-sm">
        <span className="text-muted">{chapters} فصول</span>
        <span className="inline-flex items-center gap-1 font-medium text-forest">
          اقرأ
          <Icon name="forward" size={16} className="transition-transform group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}
