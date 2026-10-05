"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn, Segmented } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import type { Ayah } from "@/lib/types";
import type { useAyahAudio } from "./useAyahAudio";

export type AyahAudio = ReturnType<typeof useAyahAudio>;

const EACH = [1, 3, 5, 10] as const;
const RANGE = [1, 2, 3] as const;

/**
 * Controls for useAyahAudio: play/pause the range, current ayah, repeat-each
 * and repeat-range, and a calm error state when the audio CDN fails.
 */
export function AudioPlayer({
  audio,
  ayahs,
  className,
  tone = "paper",
  defaultOpen = false,
  title = "الاستماع",
}: {
  audio: AyahAudio;
  ayahs: Ayah[];
  className?: string;
  tone?: "paper" | "cream";
  /** show the repeat settings expanded */
  defaultOpen?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const settingsId = useId();
  const cur = audio.current != null ? ayahs[audio.current] : null;
  const hasAudio = ayahs.some((a) => a.audioUrl);

  function toggle() {
    if (audio.playing) audio.pause();
    else if (audio.current != null && !audio.error) audio.resume();
    else audio.playAll(audio.current ?? 0);
  }

  const status = audio.error
    ? "تعذّر تشغيل التلاوة"
    : cur
      ? `${audio.playing ? "تُتلى" : "متوقفة عند"} الآية ${toArabicDigits(cur.ayah)}`
      : ayahs.length > 1
        ? `الآيات ${toArabicDigits(ayahs[0].ayah)}–${toArabicDigits(ayahs[ayahs.length - 1].ayah)}`
        : ayahs[0]
          ? `الآية ${toArabicDigits(ayahs[0].ayah)}`
          : "";

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-[var(--radius-card)] px-3 py-2.5 sm:px-4",
        tone === "cream" ? "bg-cream ring-1 ring-sand/25" : "bg-white/75 ring-1 ring-line backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!hasAudio || ayahs.length === 0}
          aria-label={audio.playing ? "إيقاف مؤقت" : "تشغيل التلاوة"}
          className="relative grid place-items-center size-11 shrink-0 rounded-full bg-forest text-cream hover:bg-forest-700 dark:bg-olive dark:hover:bg-olive-600 transition-colors disabled:opacity-40"
        >
          {audio.playing ? (
            <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-olive/40 motion-safe:animate-breathe" />
          ) : null}
          <Icon name={audio.playing ? "pause" : "play"} size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] text-muted">{title}</p>
          <p className={cn("text-sm font-medium truncate", audio.error ? "text-terracotta" : "text-forest")} aria-live="polite">
            {status}
            {cur && ayahs.length > 1 ? (
              <span className="text-muted font-normal num">
                {" "}
                · {toArabicDigits((audio.current ?? 0) + 1)} من {toArabicDigits(ayahs.length)}
              </span>
            ) : null}
          </p>
        </div>

        {audio.current != null ? (
          <button
            type="button"
            onClick={audio.stop}
            aria-label="إيقاف"
            title="إيقاف"
            className="grid place-items-center size-9 rounded-xl text-muted hover:text-forest hover:bg-parchment"
          >
            <Icon name="stop" size={17} />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={settingsId}
          className={cn(
            "inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-xs transition-colors",
            open || audio.repeatEach > 1 || audio.repeatRange > 1 ? "bg-olive-100 text-forest" : "text-muted hover:bg-parchment hover:text-forest",
          )}
        >
          <Icon name="repeat" size={16} />
          <span className="hidden sm:inline">التكرار</span>
          {audio.repeatEach > 1 || audio.repeatRange > 1 ? (
            <span className="num">
              {toArabicDigits(audio.repeatEach)}×{audio.repeatRange > 1 ? ` · ${toArabicDigits(audio.repeatRange)}↺` : ""}
            </span>
          ) : null}
        </button>
      </div>

      {audio.error ? (
        <div role="alert" className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-terracotta-50 px-3 py-2 text-xs text-terracotta">
          <Icon name="wifiOff" size={15} />
          <span className="flex-1">{hasAudio ? "تعذّر تحميل ملف التلاوة. تحقّق من اتصالك ثم أعد المحاولة." : "لا تتوفر تلاوة صوتية لهذه الآيات الآن."}</span>
          {hasAudio ? (
            <button type="button" className="font-medium underline underline-offset-4" onClick={() => audio.playAll(audio.current ?? 0)}>
              إعادة المحاولة
            </button>
          ) : null}
        </div>
      ) : null}

      <div id={settingsId} hidden={!open} className="mt-3 grid gap-3 sm:grid-cols-2 border-t hairline pt-3">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span className="text-xs text-muted">كرّر كل آية</span>
          <Segmented
            label="عدد تكرار كل آية"
            value={audio.repeatEach}
            onChange={audio.setRepeatEach}
            options={EACH.map((v) => ({ value: v, label: <span className="num">{toArabicDigits(v)}×</span> }))}
            className="[&_button]:h-8 [&_button]:px-2.5"
          />
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span className="text-xs text-muted">كرّر المقطع</span>
          <Segmented
            label="عدد تكرار المقطع كاملًا"
            value={audio.repeatRange}
            onChange={audio.setRepeatRange}
            options={RANGE.map((v) => ({ value: v, label: <span className="num">{toArabicDigits(v)}×</span> }))}
            className="[&_button]:h-8 [&_button]:px-2.5"
          />
        </div>
      </div>
    </section>
  );
}
