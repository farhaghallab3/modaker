"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import type { Ayah, AyahStatus } from "@/lib/types";
import { QuranVerse } from "./QuranVerse";
import { TafsirNote } from "./TafsirNote";
import { useTafsir } from "./useTafsir";

export const STATUS_META: Record<AyahStatus, { label: string; swatch: string; edge: string }> = {
  new: { label: "جديدة", swatch: "bg-parchment ring-1 ring-inset ring-line", edge: "border-transparent" },
  learning: { label: "قيد الحفظ", swatch: "bg-sand-100 ring-1 ring-inset ring-sand/40", edge: "border-sand/50" },
  memorized: { label: "محفوظة", swatch: "bg-olive/70", edge: "border-olive/50" },
  weak: { label: "تحتاج مراجعة", swatch: "bg-sand", edge: "border-sand" },
  mastered: { label: "متقنة", swatch: "bg-forest dark:bg-olive", edge: "border-forest/70" },
};

/**
 * One ayah in the reading view: verified text + a quiet action bar.
 * Actions are always visible (small) on touch screens and fade in on
 * hover/focus on pointer devices. Anchor: id="ayah-{n}".
 */
export const AyahCard = memo(function AyahCard({
  ayah,
  status = "new",
  bookmarked,
  playing,
  resumeHere,
  onPlay,
  onToggleBookmark,
  onMarkMemorized,
  onAddToReview,
}: {
  ayah: Ayah;
  status?: AyahStatus;
  bookmarked: boolean;
  playing: boolean;
  /** show the "توقفت هنا" marker above this ayah */
  resumeHere?: boolean;
  onPlay: (ayah: Ayah) => void;
  onToggleBookmark: (ayah: Ayah) => void;
  onMarkMemorized: (ayah: Ayah) => void;
  onAddToReview: (ayah: Ayah) => void;
}) {
  const [meaning, setMeaning] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tafsir = useTafsir(ayah.surah, meaning);
  const memorized = status !== "new" && status !== "learning";
  const n = toArabicDigits(ayah.ayah);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function announce(msg: string) {
    setFlash(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 2600);
  }

  return (
    <div id={`ayah-${ayah.ayah}`} className="scroll-mt-28">
      {resumeHere ? (
        <div className="flex items-center gap-3 py-2 text-xs font-medium text-terracotta" role="note">
          <span className="h-px flex-1 bg-terracotta/30" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-terracotta-50 px-3 py-1">
            <Icon name="bookmark" size={13} />
            توقفت هنا
          </span>
          <span className="h-px flex-1 bg-terracotta/30" />
        </div>
      ) : null}

      <article
        aria-label={`الآية ${n}`}
        className={cn(
          "group relative rounded-2xl border-s-2 ps-3 pe-2 sm:ps-5 sm:pe-4 py-3 transition-colors duration-300",
          STATUS_META[status].edge,
          playing ? "bg-olive-100/45" : "hover:bg-parchment/50 focus-within:bg-parchment/50",
        )}
      >
        <QuranVerse ayah={ayah} />

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="min-h-5 text-[0.72rem] text-muted" aria-live="polite">
            {flash ? (
              <span className="inline-flex items-center gap-1 text-olive animate-rise">
                <Icon name="check" size={13} />
                {flash}
              </span>
            ) : memorized ? (
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", STATUS_META[status].swatch)} aria-hidden />
                {STATUS_META[status].label}
              </span>
            ) : null}
          </div>

          <div
            role="toolbar"
            aria-label={`إجراءات الآية ${n}`}
            className={cn(
              "flex items-center gap-0.5 transition-opacity duration-200",
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100",
              (playing || meaning || bookmarked) && "[@media(hover:hover)]:opacity-100",
            )}
          >
            <Action icon={playing ? "volume" : "play"} label={playing ? `تُتلى الآية ${n}` : `استمع للآية ${n}`} active={playing} onClick={() => onPlay(ayah)} />
            <Action
              icon="bookmark"
              label={bookmarked ? "إزالة العلامة" : "علامة مرجعية"}
              active={bookmarked}
              onClick={() => {
                onToggleBookmark(ayah);
                announce(bookmarked ? "أُزيلت العلامة" : "أُضيفت علامة");
              }}
            />
            <Action
              icon={memorized ? "checkCircle" : "check"}
              label={memorized ? "محفوظة" : "حفظتُ هذه الآية"}
              active={memorized}
              disabled={memorized}
              onClick={() => {
                onMarkMemorized(ayah);
                announce("سُجّلت محفوظة");
              }}
            />
            <Action icon="book" label={meaning ? "إخفاء المعنى" : "اعرض المعنى"} active={meaning} expanded={meaning} onClick={() => setMeaning((v) => !v)} />
            <Action
              icon="review"
              label="أضف إلى المراجعة"
              active={status === "weak"}
              onClick={() => {
                onAddToReview(ayah);
                announce("أُضيفت إلى مراجعة اليوم");
              }}
            />
          </div>
        </div>

        {meaning ? (
          <TafsirNote
            className="mt-2"
            entry={tafsir.data?.byKey.get(ayah.key) ?? null}
            loading={tafsir.loading}
            error={!!tafsir.error}
            onRetry={tafsir.retry}
            label="المعنى — التفسير الميسر"
          />
        ) : null}
      </article>
    </div>
  );
});

function Action({
  icon,
  label,
  active,
  expanded,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid place-items-center size-9 sm:size-8 rounded-lg transition-colors disabled:cursor-default",
        active ? "text-olive bg-olive-100/70" : "text-muted/80 hover:text-forest hover:bg-white",
      )}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}
