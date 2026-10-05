"use client";

import { useRef } from "react";
import { cn } from "@/components/ui/primitives";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { StoryChapter } from "@/lib/types";

export function chapterNumber(order: number) {
  return toArabicDigits(String(order).padStart(2, "0"));
}

export function rangeLabel(c: StoryChapter, withSurah = true) {
  return c.ranges
    .map((r) => {
      const name = getSurahMeta(r.surah)?.nameAr ?? "";
      const span = r.from === r.to ? toArabicDigits(r.from) : `${toArabicDigits(r.from)}–${toArabicDigits(r.to)}`;
      return withSurah ? `${name} ${span}` : span;
    })
    .join("، ");
}

/**
 * Vertical numbered chapter list joined by a thin line.
 * Keyboard: Tab enters the list on the current chapter; ↑/↓ (and Home/End) move between chapters.
 */
export function StoryTimeline({
  chapters,
  current,
  onSelect,
  label = "فصول القصة",
}: {
  chapters: StoryChapter[];
  current: string;
  onSelect: (id: string) => void;
  label?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentIndex = Math.max(
    0,
    chapters.findIndex((c) => c.id === current),
  );

  function onKey(e: React.KeyboardEvent, i: number) {
    let j = -1;
    if (e.key === "ArrowDown") j = Math.min(chapters.length - 1, i + 1);
    else if (e.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = chapters.length - 1;
    if (j < 0) return;
    e.preventDefault();
    refs.current[j]?.focus();
  }

  return (
    <nav aria-label={label}>
      <ol className="relative space-y-1">
        {chapters.map((c, i) => {
          const active = c.id === current;
          const done = i < currentIndex;
          const last = i === chapters.length - 1;
          return (
            <li key={c.id} className="relative">
              {/* connecting hairline */}
              {!last ? (
                <span
                  className={cn("pointer-events-none absolute z-[1] top-11 -bottom-4 start-[1.375rem] w-px", done ? "bg-olive/50" : "bg-line")}
                  aria-hidden
                />
              ) : null}
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => onKey(e, i)}
                tabIndex={active ? 0 : -1}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group relative w-full text-start rounded-2xl py-3 ps-14 pe-3 transition-colors",
                  active ? "bg-white shadow-[var(--shadow-soft)]" : "hover:bg-white/60",
                )}
              >
                <span
                  className={cn(
                    "absolute start-1.5 top-3 grid place-items-center size-8 rounded-full text-[0.8rem] font-semibold num transition-colors",
                    active
                      ? "bg-forest text-cream dark:bg-olive"
                      : done
                        ? "bg-olive-100 text-olive"
                        : "bg-paper ring-1 ring-line text-muted group-hover:text-forest",
                  )}
                  aria-hidden
                >
                  {chapterNumber(c.order)}
                </span>
                <span className="sr-only">الفصل {toArabicDigits(c.order)}: </span>
                <span className={cn("block leading-6", active ? "font-semibold text-forest" : "text-ink/85")}>{c.title}</span>
                <span className="block text-xs text-muted mt-0.5">الآيات {rangeLabel(c)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
